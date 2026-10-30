import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { DatabaseService } from '../../src/database/database.service';
import { GameEngineService } from '../../src/game-engine/game-engine.service';
import { RANDOM_SOURCE } from '../../src/blue-rose/blue-rose.rules';
import { abilities } from '@solo-rpg/shared-contracts';

describe('verified Blue Rose AGE core mechanics / PostgreSQL', () => {
  let app: INestApplication, engine: GameEngineService;
  const random = { d6: jest.fn(() => 4) };
  const http = () => request(app.getHttpServer());
  const sheet = (
    name = 'Lia',
    scores: Record<string, number> = {},
    features: { ruleId: string; degree?: string; improved?: boolean }[] = [
      { ruleId: 'fighting-heavy-blades' },
    ],
  ) => ({
    commandId: randomUUID(),
    name,
    people: 'Human',
    characterClass: 'WARRIOR',
    background: 'Aldis',
    level: 1,
    maxHealth: 30,
    abilities: {
      ...Object.fromEntries(abilities.map((a) => [a, 2])),
      DEXTERITY: 4,
      ...scores,
    },
    features,
  });
  const admin = (
    campaignId: string,
    command: Record<string, unknown>,
    sessionId?: string,
  ) =>
    engine.executeInternal({
      campaignId,
      commandId: randomUUID(),
      sessionId,
      command,
    });
  const create = async () =>
    (
      await http()
        .post('/api/v1/campaigns')
        .send({ title: 'Regras Blue Rose', plannedSessions: 2 })
        .expect(201)
    ).body;
  const start = async (c: { id: string; sessions: { id: string }[] }) => {
    await http()
      .post(`/api/v1/campaigns/${c.id}/sessions/${c.sessions[0]!.id}/start`)
      .send({})
      .expect(200);
    return c.sessions[0]!.id;
  };
  const config = (
    campaignId: string,
    characterId: string,
    sessionId: string,
    armorType = 'NONE',
  ) =>
    admin(
      campaignId,
      {
        type: 'COMBAT_CONFIGURE',
        characterId,
        armorType,
        armorTrained: true,
        shieldType: 'NONE',
        shieldTrained: false,
        baseSpeed: 10,
        weaponTraining: ['heavy-blade', 'light-blade', 'longbow'],
        reason: 'Ficha revisada',
      },
      sessionId,
    );
  async function encounter(hidden = false, weapon = 'heavy-blade') {
    const c = await create();
    const pc = (
      await http()
        .post(`/api/v1/campaigns/${c.id}/characters`)
        .send(sheet())
        .expect(201)
    ).body;
    const npc = await admin(c.id, {
      type: 'CHARACTER_CREATE',
      sheet: sheet('Guarda', { DEXTERITY: 0 }),
      kind: 'NPC',
      known: !hidden,
    });
    const sessionId = await start(c);
    const item = await admin(
      c.id,
      {
        type: 'ITEM_CREATE',
        name: 'Arma',
        description: 'Blue Rose AGE',
        consumable: false,
        equipmentRuleId: weapon,
      },
      sessionId,
    );
    for (const characterId of [pc.id, npc.id]) {
      await admin(
        c.id,
        {
          type: 'ITEM_GRANT',
          characterId,
          itemId: item.id,
          quantity: 1,
          reason: 'Equipamento',
        },
        sessionId,
      );
      await admin(
        c.id,
        {
          type: 'INVENTORY_ACTION',
          characterId,
          input: {
            commandId: randomUUID(),
            sessionId,
            itemId: item.id,
            action: 'EQUIP',
          },
        },
        sessionId,
      );
      await config(
        c.id,
        characterId,
        sessionId,
        characterId === npc.id ? 'LIGHT' : 'NONE',
      );
    }
    const battle = await admin(
      c.id,
      {
        type: 'COMBAT_START',
        members: [
          { characterId: pc.id, weaponItemId: item.id, x: 0, y: 0 },
          { characterId: npc.id, weaponItemId: item.id, x: 1, y: 0 },
        ],
        visibility: 'PUBLIC',
        reason: 'Encontro revisado',
      },
      sessionId,
    );
    return {
      c,
      pc,
      npc,
      sessionId,
      item,
      battle,
      base: `/api/v1/campaigns/${c.id}/blue-rose/combat`,
    };
  }
  const action = (
    e: Awaited<ReturnType<typeof encounter>>,
    input: Record<string, unknown>,
  ) =>
    http()
      .post(`${e.base}/actions`)
      .send({
        commandId: randomUUID(),
        sessionId: e.sessionId,
        encounterId: e.battle.id,
        characterId: e.pc.id,
        ...input,
      });
  beforeAll(async () => {
    if (!process.env.INTEGRATION_DATABASE_URL)
      throw new Error('Use isolated runner');
    process.env.DATABASE_URL = process.env.INTEGRATION_DATABASE_URL;
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RANDOM_SOURCE)
      .useValue(random)
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    engine = app.get(GameEngineService);
    await migrate(app.get(DatabaseService).db, {
      migrationsFolder: resolve('drizzle'),
    });
  });
  beforeEach(() => random.d6.mockReset().mockReturnValue(4));
  afterAll(async () => {
    if (app) await app.close();
  });
  it('executes initiative, attack, immediate Stunts and verified damage transactionally', async () => {
    const e = await encounter();
    const initial = (await http().get(e.base).expect(200)).body;
    expect(initial.turnCharacterId).toBe(e.pc.id);
    expect(initial.members[0].initiative).toBe(16);
    await action(e, {
      action: 'ATTACK',
      targetId: e.npc.id,
      damage: 100,
    }).expect(400);
    await action(e, { action: 'ATTACK', targetId: e.pc.id }).expect(400);
    await action(e, {
      action: 'ATTACK',
      targetId: e.npc.id,
      characterId: e.npc.id,
    }).expect(403);
    const hit = (
      await action(e, { action: 'ATTACK', targetId: e.npc.id }).expect(201)
    ).body;
    expect(hit.pendingAttacks[0].stuntPoints).toBe(4);
    const attackId = hit.pendingAttacks[0].id;
    const spend = (stunts: string[]) =>
      http().post(`${e.base}/stunts`).send({
        commandId: randomUUID(),
        sessionId: e.sessionId,
        attackId,
        stunts,
      });
    await spend(['LETHAL_BLOW']).expect(400);
    await spend(['MIGHTY_BLOW', 'MIGHTY_BLOW']).expect(400);
    await spend(['INVENTED']).expect(400);
    await http()
      .post(`/api/v1/campaigns/${e.c.id}/blue-rose/rolls`)
      .send({ commandId: randomUUID(), sessionId: e.sessionId })
      .expect(409);
    await action(e, { action: 'AIM' }).expect(409);
    await http()
      .post(`/api/v1/campaigns/${e.c.id}/sessions/${e.sessionId}/complete`)
      .send({ endingType: 'PLAYER_REQUESTED' })
      .expect(409);
    await spend(['MIGHTY_BLOW', 'PIERCE_ARMOR']).expect(201);
    const target = (
      await http().get(`/api/v1/characters/${e.npc.id}`).expect(200)
    ).body;
    expect(target.resources[0].current).toBe(17); // (2d6+1d6)+2 - floor(3/2) = 13
    await spend([]).expect(409);
    await action(e, { action: 'ATTACK', targetId: e.npc.id }).expect(409);
    const end = (await action(e, { action: 'END_TURN' }).expect(201)).body;
    expect(end.turnCharacterId).toBe(e.npc.id);
    const events = (
      await http().get(`/api/v1/campaigns/${e.c.id}/events?limit=100`)
    ).body.data;
    expect(
      events.find((v: { type: string }) => v.type === 'STUNTS_APPLIED').changes
        .cost,
    ).toBe(4);
    expect(
      events.find((v: { type: string }) => v.type === 'DAMAGE_APPLIED').changes
        .damageDice,
    ).toEqual([4, 4, 4]);
    await admin(
      e.c.id,
      { type: 'COMBAT_END', encounterId: e.battle.id, reason: 'Fim' },
      e.sessionId,
    );
    await admin(
      e.c.id,
      {
        type: 'REST',
        characterId: e.npc.id,
        kind: 'BREATHER',
        reason: 'Cinco minutos',
      },
      e.sessionId,
    );
    expect(
      (await http().get(`/api/v1/characters/${e.npc.id}`)).body.resources[0]
        .current,
    ).toBe(25);
    await admin(
      e.c.id,
      {
        type: 'REST',
        characterId: e.npc.id,
        kind: 'BREATHER',
        reason: 'Outra pausa',
      },
      e.sessionId,
    );
    expect(
      (await http().get(`/api/v1/characters/${e.npc.id}`)).body.resources[0]
        .current,
    ).toBe(25);
  });
  it('expires unused SP on ending a turn, enforces action budgets and keeps secret encounters off HTTP', async () => {
    const e = await encounter();
    await action(e, { action: 'AIM' }).expect(201);
    await action(e, { action: 'ATTACK', targetId: e.npc.id }).expect(201);
    await action(e, { action: 'MOVE', x: 2, y: 0 }).expect(409);
    await action(e, { action: 'END_TURN' }).expect(201);
    const rolls = (
      await http().get(`/api/v1/campaigns/${e.c.id}/blue-rose/rolls?limit=100`)
    ).body.data;
    expect(
      rolls.every(
        (r: { availableStuntPoints: number }) => r.availableStuntPoints === 0,
      ),
    ).toBe(true);
    const state = (await http().get(e.base)).body;
    expect(state.pendingAttacks).toEqual([]);
    await admin(
      e.c.id,
      {
        type: 'COMBAT_ACTION',
        input: {
          commandId: randomUUID(),
          sessionId: e.sessionId,
          encounterId: e.battle.id,
          characterId: e.npc.id,
          action: 'DEFEND',
        },
      },
      e.sessionId,
    );
    await admin(
      e.c.id,
      {
        type: 'COMBAT_ACTION',
        input: {
          commandId: randomUUID(),
          sessionId: e.sessionId,
          encounterId: e.battle.id,
          characterId: e.npc.id,
          action: 'END_TURN',
        },
      },
      e.sessionId,
    );
    await action(e, { action: 'MOVE', x: 999, y: 999 }).expect(409);
    await action(e, { action: 'STAND' }).expect(409);
    await action(e, { action: 'RELOAD' }).expect(409);
    await action(e, { action: 'MOVE', x: 2, y: 0 }).expect(201);
    await action(e, { action: 'AIM' }).expect(201);
    await action(e, { action: 'DEFEND' }).expect(409);
    await admin(
      e.c.id,
      { type: 'COMBAT_END', encounterId: e.battle.id, reason: 'Fim' },
      e.sessionId,
    );
    const hidden = await encounter(true);
    expect((await http().get(hidden.base).expect(200)).body).toBeNull();
    await action(hidden, { action: 'ATTACK', targetId: hidden.npc.id }).expect(
      404,
    );
    expect(
      (await http().get(`/api/v1/campaigns/${hidden.c.id}/blue-rose/rolls`))
        .body.data,
    ).toEqual([]);
  });
  it('applies knockdown, defensive stance, lethal damage and NPC death from server dice', async () => {
    const e = await encounter();
    const hit = (
      await action(e, { action: 'ATTACK', targetId: e.npc.id }).expect(201)
    ).body;
    await http()
      .post(`${e.base}/stunts`)
      .send({
        commandId: randomUUID(),
        sessionId: e.sessionId,
        attackId: hit.pendingAttacks[0].id,
        stunts: ['KNOCK_PRONE', 'DEFENSIVE_STANCE'],
      })
      .expect(201);
    expect(
      (await http().get(e.base)).body.members.find(
        (m: { characterId: string }) => m.characterId === e.npc.id,
      ).prone,
    ).toBe(true);
    await action(e, { action: 'END_TURN' }).expect(201);
    await admin(
      e.c.id,
      {
        type: 'COMBAT_ACTION',
        input: {
          commandId: randomUUID(),
          sessionId: e.sessionId,
          encounterId: e.battle.id,
          characterId: e.npc.id,
          action: 'STAND',
        },
      },
      e.sessionId,
    );
    await admin(
      e.c.id,
      {
        type: 'COMBAT_ACTION',
        input: {
          commandId: randomUUID(),
          sessionId: e.sessionId,
          encounterId: e.battle.id,
          characterId: e.npc.id,
          action: 'END_TURN',
        },
      },
      e.sessionId,
    );
    random.d6.mockReturnValue(6);
    const second = (
      await action(e, { action: 'ATTACK', targetId: e.npc.id }).expect(201)
    ).body;
    await http()
      .post(`${e.base}/stunts`)
      .send({
        commandId: randomUUID(),
        sessionId: e.sessionId,
        attackId: second.pendingAttacks[0].id,
        stunts: ['LETHAL_BLOW'],
      })
      .expect(201);
    const dead = (await http().get(`/api/v1/characters/${e.npc.id}`)).body;
    expect(dead.resources[0].current).toBe(0);
    expect(dead.lifeState).toBe('DEAD');
  });
  it('uses long range and reload rules and rejects unsupported/untrained combat', async () => {
    const e = await encounter(false, 'longbow');
    const hit = (
      await action(e, { action: 'ATTACK', targetId: e.npc.id }).expect(201)
    ).body;
    await http()
      .post(`${e.base}/stunts`)
      .send({
        commandId: randomUUID(),
        sessionId: e.sessionId,
        attackId: hit.pendingAttacks[0].id,
        stunts: [],
      })
      .expect(201);
    await action(e, { action: 'END_TURN' }).expect(201);
    await admin(
      e.c.id,
      {
        type: 'COMBAT_ACTION',
        input: {
          commandId: randomUUID(),
          sessionId: e.sessionId,
          encounterId: e.battle.id,
          characterId: e.npc.id,
          action: 'END_TURN',
        },
      },
      e.sessionId,
    );
    await action(e, { action: 'ATTACK', targetId: e.npc.id }).expect(409);
    await action(e, { action: 'RELOAD' }).expect(201);
    await action(e, { action: 'ATTACK', targetId: e.npc.id }).expect(201);
    await expect(config(e.c.id, e.pc.id, e.sessionId)).rejects.toThrow(
      /locked|pending Stunts/,
    );
  });
  it('resolves Cure with its specific healing, fatigue, repeat-target limit and persistent rest', async () => {
    const c = await create();
    const caster = (
      await http()
        .post(`/api/v1/campaigns/${c.id}/characters`)
        .send(
          sheet('Curandeira', {}, [
            { ruleId: 'cure' },
            { ruleId: 'healing-talent', degree: 'NOVICE' },
            { ruleId: 'intelligence-healing' },
            { ruleId: 'willpower-self-discipline' },
          ]),
        )
        .expect(201)
    ).body;
    const target = await admin(c.id, {
      type: 'CHARACTER_CREATE',
      sheet: sheet('Paciente'),
      kind: 'NPC',
      known: true,
    });
    const sessionId = await start(c);
    await admin(
      c.id,
      {
        type: 'RESOURCE_SET',
        characterId: target.id,
        name: 'HEALTH',
        current: 10,
        maximum: 30,
        reason: 'Ferimento transcrito',
      },
      sessionId,
    );
    const prepare = () =>
      admin(
        c.id,
        {
          type: 'ARCANA_CURE_PREPARE',
          characterId: caster.id,
          targetId: target.id,
          touchConfirmed: true,
          visibility: 'PUBLIC',
          reason: 'Curar ferimentos',
        },
        sessionId,
      );
    const prepared = await prepare();
    await http()
      .post(`/api/v1/campaigns/${c.id}/blue-rose/arcana/cure`)
      .send({ commandId: randomUUID(), requestId: prepared.id })
      .expect(201);
    expect(
      (await http().get(`/api/v1/characters/${target.id}`)).body.resources[0]
        .current,
    ).toBe(19);
    const again = await prepare();
    await http()
      .post(`/api/v1/campaigns/${c.id}/blue-rose/arcana/cure`)
      .send({ commandId: randomUUID(), requestId: again.id })
      .expect(409);
    await admin(
      c.id,
      {
        type: 'REST',
        characterId: target.id,
        kind: 'BREATHER',
        reason: 'Pausa narrativa de cinco minutos',
      },
      sessionId,
    );
    random.d6.mockReturnValue(1);
    await http()
      .post(`/api/v1/campaigns/${c.id}/blue-rose/arcana/cure`)
      .send({ commandId: randomUUID(), requestId: again.id })
      .expect(201);
    expect(
      (await http().get(`/api/v1/characters/${caster.id}`)).body.fatigueLevel,
    ).toBe(1);
    const events = (
      await http().get(`/api/v1/campaigns/${c.id}/events?limit=100`)
    ).body.data;
    expect(
      events
        .filter((v: { type: string }) => v.type === 'ARCANA_RESOLVED')
        .at(-1).changes.fatigueTargetNumber,
    ).toBe(12);
    await admin(
      c.id,
      {
        type: 'REST',
        characterId: caster.id,
        kind: 'SLEEP',
        reason: 'Seis horas',
      },
      sessionId,
    );
    expect(
      (await http().get(`/api/v1/characters/${caster.id}`)).body.fatigueLevel,
    ).toBe(0);
    const secret = await admin(
      c.id,
      {
        type: 'ARCANA_CURE_PREPARE',
        characterId: caster.id,
        targetId: target.id,
        touchConfirmed: true,
        visibility: 'GM_ONLY',
        reason: 'SECRET CURE',
      },
      sessionId,
    );
    await http()
      .post(`/api/v1/campaigns/${c.id}/blue-rose/arcana/cure`)
      .send({ commandId: randomUUID(), requestId: secret.id })
      .expect(404);
    expect(
      JSON.stringify(
        (
          await http().get(
            `/api/v1/campaigns/${c.id}/blue-rose/arcana/requests`,
          )
        ).body,
      ),
    ).not.toContain(secret.id);
  });
  it('preserves the dying countdown and rejects closing action time while someone is dying', async () => {
    const e = await encounter();
    await admin(
      e.c.id,
      {
        type: 'RESOURCE_SET',
        characterId: e.pc.id,
        name: 'HEALTH',
        current: 2,
        maximum: 30,
        reason: 'Ferimento anterior',
      },
      e.sessionId,
    );
    await action(e, { action: 'END_TURN' }).expect(201);
    const input = (action: string) => ({
      commandId: randomUUID(),
      sessionId: e.sessionId,
      encounterId: e.battle.id,
      characterId: e.npc.id,
      action,
    });
    await admin(
      e.c.id,
      {
        type: 'COMBAT_ACTION',
        input: { ...input('ATTACK'), targetId: e.pc.id },
      },
      e.sessionId,
    );
    const state = (await http().get(e.base)).body;
    await admin(
      e.c.id,
      {
        type: 'COMBAT_RESOLVE',
        input: {
          commandId: randomUUID(),
          sessionId: e.sessionId,
          attackId: state.pendingAttacks[0].id,
          stunts: [],
        },
      },
      e.sessionId,
    );
    expect(
      (await http().get(`/api/v1/characters/${e.pc.id}`)).body,
    ).toMatchObject({ lifeState: 'DYING' });
    await expect(
      admin(
        e.c.id,
        {
          type: 'COMBAT_END',
          encounterId: e.battle.id,
          reason: 'Não pode perder o prazo',
        },
        e.sessionId,
      ),
    ).rejects.toThrow('dying');
    for (let n = 0; n < 4; n++)
      await admin(
        e.c.id,
        { type: 'COMBAT_ACTION', input: input('END_TURN') },
        e.sessionId,
      );
    expect(
      (await http().get(`/api/v1/characters/${e.pc.id}`)).body,
    ).toMatchObject({ lifeState: 'DEAD' });
  });
  it('tracks all four fatigue levels, prevents healing nonliving targets and rejects missing arcana', async () => {
    const c = await create(),
      base = `/api/v1/campaigns/${c.id}/blue-rose`;
    const pc = (
      await http()
        .post(`/api/v1/campaigns/${c.id}/characters`)
        .send(
          sheet('Curandeira', { INTELLIGENCE: 4, WILLPOWER: -2 }, [
            { ruleId: 'cure' },
            { ruleId: 'healing-talent', degree: 'NOVICE' },
          ]),
        )
        .expect(201)
    ).body;
    const target = await admin(c.id, {
      type: 'CHARACTER_CREATE',
      sheet: sheet('Paciente'),
      kind: 'NPC',
      known: true,
    });
    const undead = await admin(c.id, {
      type: 'CHARACTER_CREATE',
      sheet: sheet('Não vivo'),
      kind: 'ADVERSARY',
      known: true,
      living: false,
    });
    const sessionId = await start(c);
    const prepare = (targetId: string) =>
      admin(
        c.id,
        {
          type: 'ARCANA_CURE_PREPARE',
          characterId: pc.id,
          targetId,
          touchConfirmed: true,
          visibility: 'PUBLIC',
          reason: 'Curar',
        },
        sessionId,
      );
    await expect(
      admin(
        c.id,
        {
          type: 'ARCANA_CURE_PREPARE',
          characterId: target.id,
          targetId: pc.id,
          touchConfirmed: true,
          visibility: 'PUBLIC',
          reason: 'Sem conhecimento',
        },
        sessionId,
      ),
    ).rejects.toThrow('required');
    const wrong = await prepare(undead.id);
    await http()
      .post(`${base}/arcana/cure`)
      .send({ commandId: randomUUID(), requestId: wrong.id })
      .expect(409);
    for (let n = 1; n <= 4; n++) {
      await admin(
        c.id,
        {
          type: 'RESOURCE_SET',
          characterId: target.id,
          name: 'HEALTH',
          current: 1,
          maximum: 30,
          reason: 'Ferimento transcrito',
        },
        sessionId,
      );
      await admin(
        c.id,
        {
          type: 'REST',
          characterId: target.id,
          kind: 'BREATHER',
          reason: 'Pausa',
        },
        sessionId,
      );
      const request = await prepare(target.id);
      await http()
        .post(`${base}/arcana/cure`)
        .send({ commandId: randomUUID(), requestId: request.id })
        .expect(201);
      expect(
        (await http().get(`/api/v1/characters/${pc.id}`)).body.fatigueLevel,
      ).toBe(n);
    }
    const dying = (await http().get(`/api/v1/characters/${pc.id}`)).body;
    expect(dying.lifeState).toBe('DYING');
    expect(dying.resources[0].current).toBe(0);
    await expect(
      admin(
        c.id,
        {
          type: 'REST',
          characterId: pc.id,
          kind: 'SLEEP',
          reason: 'Não revive',
        },
        sessionId,
      ),
    ).rejects.toThrow('cannot rest');
  });
  it('uses improved focuses only from level 11 and initializes protagonist Conviction', async () => {
    const c = await create(),
      input = sheet('Veterana', {}, [
        { ruleId: 'fighting-heavy-blades', improved: true },
      ]);
    await http()
      .post(`/api/v1/campaigns/${c.id}/characters`)
      .send(input)
      .expect(400);
    const pc = (
      await http()
        .post(`/api/v1/campaigns/${c.id}/characters`)
        .send({ ...input, level: 11 })
        .expect(201)
    ).body;
    expect(
      pc.resources.find((r: { name: string }) => r.name === 'CONVICTION'),
    ).toMatchObject({ current: 8, maximum: 8 });
    const sessionId = await start(c),
      check = await admin(
        c.id,
        {
          type: 'CHECK_PREPARE',
          characterId: pc.id,
          ability: 'FIGHTING',
          focusId: 'fighting-heavy-blades',
          targetNumber: 17,
          reason: 'Teste',
          visibility: 'PUBLIC',
        },
        sessionId,
      );
    const result = (
      await http()
        .post(`/api/v1/campaigns/${c.id}/blue-rose/checks`)
        .send({ commandId: randomUUID(), requestId: check.id })
        .expect(201)
    ).body;
    expect(result.modifier).toBe(5);
    expect(result.success).toBe(true);
  });
  it('persists opposed and advanced tests, applies tie breakers and ignores failed advanced attempts', async () => {
    const c = await create(),
      base = `/api/v1/campaigns/${c.id}/blue-rose`;
    const pc = (
      await http()
        .post(`/api/v1/campaigns/${c.id}/characters`)
        .send(sheet())
        .expect(201)
    ).body;
    const npc = await admin(c.id, {
      type: 'CHARACTER_CREATE',
      sheet: sheet('Oponente', { DEXTERITY: 0 }),
      kind: 'NPC',
      known: true,
    });
    const sessionId = await start(c);
    const opposed = await admin(
      c.id,
      {
        type: 'OPPOSED_PREPARE',
        characterId: pc.id,
        ability: 'DEXTERITY',
        opponentId: npc.id,
        opponentAbility: 'DEXTERITY',
        visibility: 'PUBLIC',
        reason: 'Perseguição',
        stuntsEligible: true,
      },
      sessionId,
    );
    const won = (
      await http()
        .post(`${base}/checks`)
        .send({ commandId: randomUUID(), requestId: opposed.id })
        .expect(201)
    ).body;
    expect(won.success).toBe(true);
    expect(won.stuntPoints).toBe(4);
    const task = await admin(
      c.id,
      {
        type: 'ADVANCED_CREATE',
        characterId: pc.id,
        ability: 'INTELLIGENCE',
        targetNumber: 13,
        threshold: 8,
        intervalMinutes: 60,
        reason: 'Pesquisar',
        visibility: 'PUBLIC',
      },
      sessionId,
    );
    for (const face of [1, 4, 4]) {
      random.d6.mockReturnValue(face);
      const attempt = await admin(
        c.id,
        { type: 'ADVANCED_PREPARE', advancedTestId: task.id },
        sessionId,
      );
      await http()
        .post(`${base}/checks`)
        .send({ commandId: randomUUID(), requestId: attempt.id })
        .expect(201);
    }
    const progress = (
      await http().get(`${base}/advanced-tests`).expect(200)
    ).body.find((t: { id: string }) => t.id === task.id);
    expect(progress).toMatchObject({ progress: 8, attempts: 3 });
    await expect(
      admin(
        c.id,
        { type: 'ADVANCED_PREPARE', advancedTestId: task.id },
        sessionId,
      ),
    ).rejects.toThrow('completed');
  });
});
