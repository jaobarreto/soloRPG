import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { sql } from 'drizzle-orm';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { DatabaseService } from '../../src/database/database.service';
import { GameEngineService } from '../../src/game-engine/game-engine.service';
import { AiServiceClient } from '../../src/integrations/ai-service/ai-service.client';
import { NarrativeContextService } from '../../src/narrative/context.service';
import { RANDOM_SOURCE } from '../../src/blue-rose/blue-rose.rules';
import {
  abilities,
  scenePlanSchema,
  type ScenePlan,
} from '@solo-rpg/shared-contracts';

describe('Narrative officialization and recovery / PostgreSQL', () => {
  let app: INestApplication, db: DatabaseService, engine: GameEngineService;
  const turn = jest.fn();
  let selectedOptionId: string;
  const http = () => request(app.getHttpServer());
  const admin = (campaignId: string, command: unknown) =>
    engine.executeInternal({ campaignId, commandId: randomUUID(), command });
  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.INTEGRATION_DATABASE_URL;
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AiServiceClient)
      .useValue({ turn, checkHealth: jest.fn() })
      .overrideProvider(RANDOM_SOURCE)
      .useValue({ d6: () => 4 })
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    db = app.get(DatabaseService);
    engine = app.get(GameEngineService);
    await migrate(db.db, { migrationsFolder: resolve('drizzle') });
  });
  afterAll(async () => {
    if (app) await app.close();
  });
  async function setup(
    check = false,
    customize?: (
      campaign: { id: string; sessions: { id: string }[] },
      pc: { id: string },
      plan: ScenePlan,
    ) => Promise<void>,
  ) {
    const campaign = (
      await http()
        .post('/api/v1/campaigns')
        .send({ title: 'Ecos', plannedSessions: 2 })
        .expect(201)
    ).body;
    const pc = (
      await http()
        .post(`/api/v1/campaigns/${campaign.id}/characters`)
        .send({
          commandId: randomUUID(),
          name: 'Naelis',
          people: 'Human',
          background: 'Aldis',
          characterClass: 'EXPERT',
          level: 1,
          maxHealth: 30,
          abilities: Object.fromEntries(abilities.map((a) => [a, 2])),
        })
        .expect(201)
    ).body;
    const optionId = randomUUID(),
      objectiveId = randomUUID();
    selectedOptionId = optionId;
    const sessionId = campaign.sessions[0].id;
    const plan = scenePlanSchema.parse({
      opening: 'A trilha termina diante da muralha.',
      presentCharacterIds: [pc.id],
      options: [
        {
          id: optionId,
          intent: 'Escalar a muralha',
          keywords: ['escalar'],
          mode: 'ACT',
          check: check
            ? {
                ability: 'STRENGTH',
                focusId: null,
                targetNumber: 10,
                secret: false,
              }
            : null,
          successText: 'A passagem no alto da muralha está agora acessível.',
          failureText: 'A muralha permanece um obstáculo.',
          witnesses: [],
          effects: [],
        },
      ],
      objectives: [
        {
          id: objectiveId,
          description: 'Encontrar a passagem',
          requiredOptionIds: [optionId],
        },
      ],
    });
    if (customize) await customize(campaign, pc, plan);
    await admin(campaign.id, {
      type: 'SCENE_CONFIGURE',
      targetSessionId: sessionId,
      plan,
    });
    await http()
      .post(`/api/v1/campaigns/${campaign.id}/sessions/${sessionId}/start`)
      .send({})
      .expect(200);
    const path = `/api/v1/campaigns/${campaign.id}/sessions/${sessionId}`;
    turn.mockReset().mockImplementation(async (input) => ({
      proposal: input.stage === 'PROPOSE' ? { kind: 'SCENE', optionId } : null,
      narration: input.stage === 'NARRATE' ? input.confirmed : null,
      usage: [],
      error: null,
    }));
    return { campaign, pc, path, optionId, sessionId };
  }
  const input = () => ({
    actionId: randomUUID(),
    interactionMode: 'ACT',
    content: 'Quero escalar a muralha.',
    optionId: selectedOptionId,
  });
  const npcSheet = (name = 'Theron', dexterity = 4) => ({
    commandId: randomUUID(),
    name,
    people: 'Human',
    background: 'Aldis',
    characterClass: 'WARRIOR',
    level: 1,
    maxHealth: 30,
    abilities: {
      ...Object.fromEntries(abilities.map((a) => [a, 2])),
      DEXTERITY: dexterity,
    },
    features: [{ ruleId: 'fighting-heavy-blades' }],
  });
  it('persists relationship, inventory, world, witnessed memory and objective evidence across sessions', async () => {
    let npcId = '',
      itemId = '';
    const { campaign, pc, path } = await setup(true, async (c, pc, plan) => {
      npcId = (
        await admin(c.id, {
          type: 'CHARACTER_CREATE',
          kind: 'NPC',
          known: true,
          sheet: npcSheet(),
          personality: 'Desconfiado',
          privateNotes: 'SEGREDO NÃO AUTORIZADO',
        })
      ).id;
      itemId = (
        await admin(c.id, {
          type: 'ITEM_CREATE',
          name: 'Chave',
          description: 'Chave de ferro',
          consumable: false,
        })
      ).id;
      await admin(c.id, {
        type: 'ITEM_GRANT',
        characterId: npcId,
        itemId,
        quantity: 1,
        reason: 'Posse inicial',
      });
      await admin(c.id, {
        type: 'METRIC_DEFINE',
        name: 'trust',
        minimum: -10,
        maximum: 10,
      });
      await admin(c.id, {
        type: 'RELATIONSHIP_SET',
        fromCharacterId: npcId,
        toCharacterId: pc.id,
        metric: 'trust',
        value: 0,
        reason: 'Contato inicial',
        visibility: 'PUBLIC',
      });
      const entityId = randomUUID();
      await admin(c.id, {
        type: 'WORLD_UPSERT',
        entityId,
        kind: 'LOCATION',
        name: 'Portão',
        description: 'Acesso norte',
        status: 'CLOSED',
        accessible: false,
        visibility: 'PUBLIC',
        reason: 'Cena inicial',
      });
      plan.presentCharacterIds.push(npcId);
      plan.options[0]!.witnesses = [npcId];
      plan.options[0]!.successText =
        'Theron entrega a chave; a passagem está aberta. Ele passa a confiar mais em Naelis.';
      plan.options[0]!.effects = [
        { type: 'TRANSFER', fromId: npcId, toId: pc.id, itemId, quantity: 1 },
        {
          type: 'RELATIONSHIP',
          fromId: npcId,
          toId: pc.id,
          metric: 'trust',
          delta: 2,
        },
        {
          type: 'WORLD_STATUS',
          entityId,
          expectedStatus: 'CLOSED',
          status: 'OPEN',
          accessible: true,
        },
      ];
      await admin(c.id, {
        type: 'SCENE_CONFIGURE',
        targetSessionId: c.sessions[1]!.id,
        plan: {
          ...plan,
          options: [],
          objectives: [],
          opening: 'A história continua junto ao portão aberto.',
        },
      });
    });
    const body = input();
    await http().post(`${path}/actions`).send(body).expect(201);
    await http()
      .post(`${path}/actions/${body.actionId}/roll`)
      .send({})
      .expect(200);
    expect(
      (await http().get(`/api/v1/characters/${pc.id}`)).body.inventory[0]
        .itemId,
    ).toBe(itemId);
    const knowledge = await db.db.execute(
      sql`SELECT * FROM character_knowledge WHERE character_id = ${npcId}`,
    );
    expect(knowledge.rows).toHaveLength(1);
    await http()
      .post(`${path}/finalize`)
      .send({ endingType: 'OBJECTIVE_COMPLETED' })
      .expect(200);
    await http()
      .post(`${path}/finalize`)
      .send({ endingType: 'OBJECTIVE_COMPLETED' })
      .expect(200);
    const secondId = campaign.sessions[1].id;
    await http()
      .post(`/api/v1/campaigns/${campaign.id}/sessions/${secondId}/start`)
      .send({})
      .expect(200);
    const context = await app
      .get(NarrativeContextService)
      .build(campaign.id, secondId);
    expect(context.relationships[0]!.value).toBe(2);
    expect(
      context.characters.find((c) => c.id === npcId)!.knowledge[0]!.description,
    ).toContain('confiar');
    expect(context.previous[0]!.summary).toContain('chave');
    expect(JSON.stringify(context)).not.toContain('SEGREDO NÃO AUTORIZADO');
  });
  it('rolls back dependent effects together and supports explicit cancellation of an invalid proposal', async () => {
    let itemId = '';
    const { campaign, path } = await setup(false, async (c, pc, plan) => {
      const npc = await admin(c.id, {
        type: 'CHARACTER_CREATE',
        kind: 'NPC',
        known: true,
        sheet: npcSheet(),
      });
      itemId = (
        await admin(c.id, {
          type: 'ITEM_CREATE',
          name: 'Chave',
          description: 'Ferro',
          consumable: false,
        })
      ).id;
      await admin(c.id, {
        type: 'ITEM_GRANT',
        characterId: npc.id,
        itemId,
        quantity: 1,
        reason: 'Posse inicial',
      });
      plan.presentCharacterIds.push(npc.id);
      plan.options[0]!.effects = [
        { type: 'TRANSFER', fromId: npc.id, toId: pc.id, itemId, quantity: 1 },
        {
          type: 'WORLD_STATUS',
          entityId: randomUUID(),
          expectedStatus: 'CLOSED',
          status: 'OPEN',
          accessible: true,
        },
      ];
    });
    const body = input();
    expect(
      (await http().post(`${path}/actions`).send(body).expect(201)).body.status,
    ).toBe('PENDING');
    const inventory = await db.db.execute(
      sql`SELECT quantity FROM character_inventory WHERE campaign_id = ${campaign.id} AND item_id = ${itemId}`,
    );
    expect(inventory.rows).toEqual([{ quantity: 1 }]);
    await http()
      .post(`${path}/messages`)
      .send({ interactionMode: 'SPEAK', content: 'Outra mensagem' })
      .expect(409);
    await http()
      .post(`${path}/finalize`)
      .send({ endingType: 'PLAYER_REQUESTED' })
      .expect(409);
    await http()
      .post(`${path}/actions/${body.actionId}/cancel`)
      .send({})
      .expect(200);
    await http()
      .post(`${path}/actions/${body.actionId}/cancel`)
      .send({})
      .expect(200);
    expect(
      (await http().get(`${path}/actions/${body.actionId}`)).body.status,
    ).toBe('REJECTED');
    await http().get(`${path}/actions/${randomUUID()}`).expect(404);
    await http().get(`${path}/ai-usage`).expect(200);
    await http().get(`${path}/actions/${body.actionId}/stream`).expect(200);
  });
  it('never publishes invented narration, protects secret rolls and rejects objective claims without evidence', async () => {
    const { path } = await setup(true, async (_c, _pc, plan) => {
      plan.options[0]!.check!.secret = true;
      plan.options[0]!.check!.targetNumber = 100;
    });
    const normal = turn.getMockImplementation()!;
    turn.mockImplementation(async (r) =>
      r.stage === 'NARRATE'
        ? {
            proposal: null,
            narration: {
              narrative: 'Você recebe uma espada e conclui o objetivo.',
              eventIds: [],
            },
            usage: [],
            error: null,
          }
        : normal(r),
    );
    const body = input();
    expect(
      (await http().post(`${path}/actions`).send(body).expect(201)).body.status,
    ).toBe('COMPLETED');
    const messages = (await http().get(`${path}/messages`)).body.data;
    expect(messages).toHaveLength(2);
    expect(messages[1].content).toBe('A muralha permanece um obstáculo.');
    expect(JSON.stringify(messages)).not.toContain('Drama');
    await http()
      .post(`${path}/finalize`)
      .send({ endingType: 'OBJECTIVE_COMPLETED' })
      .expect(409);
    await http()
      .post(`${path}/actions`)
      .send({ ...input(), interactionMode: 'THINK' })
      .expect(201);
  });
  it('keeps NPC attack damage pending until Stunts resolve, without ever repeating the attack', async () => {
    let npcId = '',
      itemId = '';
    const { campaign, pc, sessionId, path } = await setup(
      false,
      async (c, _pc, plan) => {
        npcId = (
          await admin(c.id, {
            type: 'CHARACTER_CREATE',
            kind: 'NPC',
            known: true,
            sheet: npcSheet(),
          })
        ).id;
        itemId = (
          await admin(c.id, {
            type: 'ITEM_CREATE',
            name: 'Espada',
            description: 'Lâmina pesada',
            consumable: false,
            equipmentRuleId: 'heavy-blade',
          })
        ).id;
        plan.presentCharacterIds.push(npcId);
      },
    );
    const command = (cmd: unknown) =>
      engine.executeInternal({
        campaignId: campaign.id,
        sessionId,
        commandId: randomUUID(),
        command: cmd,
      });
    for (const characterId of [pc.id, npcId]) {
      await command({
        type: 'ITEM_GRANT',
        characterId,
        itemId,
        quantity: 1,
        reason: 'Arma equipada',
      });
      await command({
        type: 'INVENTORY_ACTION',
        characterId,
        input: { commandId: randomUUID(), sessionId, action: 'EQUIP', itemId },
      });
      await command({
        type: 'COMBAT_CONFIGURE',
        characterId,
        armorType: 'NONE',
        armorTrained: false,
        shieldType: 'NONE',
        shieldTrained: false,
        baseSpeed: 10,
        weaponTraining: ['heavy-blade'],
        reason: 'Perfil revisado',
      });
    }
    await command({
      type: 'COMBAT_START',
      visibility: 'PUBLIC',
      reason: 'Confronto preparado',
      members: [
        { characterId: pc.id, weaponItemId: itemId, x: 0, y: 0 },
        { characterId: npcId, weaponItemId: itemId, x: 1, y: 0 },
      ],
    });
    turn.mockImplementation(async (r) => ({
      proposal:
        r.stage === 'PROPOSE'
          ? { kind: 'ATTACK', actorId: npcId, targetId: pc.id }
          : null,
      narration: r.stage === 'NARRATE' ? r.confirmed : null,
      usage: [],
      error: null,
    }));
    const body = input();
    const pending = (
      await http().post(`${path}/actions`).send(body).expect(201)
    ).body;
    expect(pending.status).toBe('AWAITING_STUNTS');
    expect(
      (await http().get(`/api/v1/characters/${pc.id}`)).body.resources[0]
        .current,
    ).toBe(30);
    expect(
      (await http().get(`${path}/messages`)).body.data.filter(
        (m: { role: string }) => m.role === 'GAME_MASTER',
      ),
    ).toHaveLength(0);
    expect(
      (
        await http()
          .post(`${path}/actions/${body.actionId}/decline-npc-stunts`)
          .send({})
          .expect(200)
      ).body.status,
    ).toBe('COMPLETED');
    const health = (await http().get(`/api/v1/characters/${pc.id}`)).body
      .resources[0].current;
    expect(health).toBeLessThan(30);
    await http().post(`${path}/actions`).send(body).expect(201);
    expect(
      (await http().get(`/api/v1/characters/${pc.id}`)).body.resources[0]
        .current,
    ).toBe(health);
    const attacks = await db.db.execute(
      sql`SELECT * FROM blue_rose_attacks WHERE actor_id = ${npcId}`,
    );
    expect(attacks.rows).toHaveLength(1);
  });
  it('requires explicit player authorization and never completes objectives through the legacy endpoint', async () => {
    const { path } = await setup();
    const body = {
      ...input(),
      optionId: undefined,
      content: 'Não quero escalar a muralha.',
    };
    const result = (await http().post(`${path}/actions`).send(body).expect(201))
      .body;
    expect(result.status).toBe('PENDING');
    await http()
      .post(`${path}/actions/${body.actionId}/cancel`)
      .send({})
      .expect(200);
    await http()
      .post(`${path}/complete`)
      .send({ endingType: 'OBJECTIVE_COMPLETED' })
      .expect(409);
    expect(
      (await http().get(`${path}/narrative-state`)).body.objectiveCompleted,
    ).toBe(false);
  });
  it('commits before narration and retries only narration after failure; full history survives session 2', async () => {
    const { campaign, path } = await setup();
    const body = input();
    const normal = turn.getMockImplementation()!;
    turn.mockImplementation(async (req) => {
      if (req.stage === 'NARRATE') {
        const events = await db.db.execute(
          sql`SELECT * FROM game_events WHERE campaign_id = ${campaign.id} AND type = 'CONSEQUENCE_RECORDED'`,
        );
        expect(events.rows).toHaveLength(1);
        throw new Error('provider timeout with a SECRET');
      }
      return normal(req);
    });
    const pending = (
      await http().post(`${path}/actions`).send(body).expect(201)
    ).body;
    expect(pending.status).toBe('COMMITTED');
    expect(pending.error).not.toContain('SECRET');
    await http().post(`${path}/actions`).send(input()).expect(409);
    turn.mockImplementation(normal);
    const done = (
      await http()
        .post(`${path}/actions/${body.actionId}/retry`)
        .send({})
        .expect(200)
    ).body;
    expect(done.status).toBe('COMPLETED');
    expect(turn.mock.calls.filter(([r]) => r.stage === 'PROPOSE')).toHaveLength(
      1,
    );
    expect(
      (await http().post(`${path}/actions`).send(body).expect(201)).body,
    ).toEqual(done);
    await http()
      .post(`${path}/actions`)
      .send({ ...body, content: 'Outro texto' })
      .expect(409);
    const history = (await http().get(`${path}/messages`).expect(200)).body
      .data;
    expect(history).toHaveLength(2);
    await http()
      .post(`${path}/finalize`)
      .send({ endingType: 'OBJECTIVE_COMPLETED' })
      .expect(200);
    const second = `/api/v1/campaigns/${campaign.id}/sessions/${campaign.sessions[1].id}`;
    await http().post(`${second}/start`).send({}).expect(200);
    expect((await http().get(`${path}/messages`)).body.data).toEqual(history);
    expect((await http().get(`${path}/summary`)).body.summary).toContain(
      'passagem',
    );
  });
  it('waits for official dice and serializes duplicate roll resumes', async () => {
    const { path } = await setup(true);
    const body = input();
    expect(
      (await http().post(`${path}/actions`).send(body).expect(201)).body.status,
    ).toBe('AWAITING_ROLL');
    expect(turn).toHaveBeenCalledTimes(1);
    const responses = await Promise.all(
      [1, 2].map(() =>
        http().post(`${path}/actions/${body.actionId}/roll`).send({}),
      ),
    );
    expect(responses.every((r) => r.status === 200)).toBe(true);
    const history = (await http().get(`${path}/messages`)).body.data;
    expect(
      history.filter((m: { role: string }) => m.role === 'SYSTEM'),
    ).toHaveLength(1);
    expect(
      history.filter((m: { role: string }) => m.role === 'GAME_MASTER'),
    ).toHaveLength(1);
  });
  it('rejects arbitrary well-formed JSON, and OOC cannot change the world', async () => {
    const { path } = await setup();
    turn.mockResolvedValue({
      proposal: { kind: 'OBSERVE', damage: 99 },
      narration: null,
      usage: [],
      error: null,
    });
    const bad = (await http().post(`${path}/actions`).send(input()).expect(201))
      .body;
    expect(bad.status).toBe('PENDING');
    expect(bad.retryable).toBe(true);
    turn.mockImplementation(async (r) => ({
      proposal: r.stage === 'PROPOSE' ? { kind: 'OBSERVE' } : null,
      narration: r.stage === 'NARRATE' ? r.confirmed : null,
      usage: [],
      error: null,
    }));
    await http().post(`${path}/actions/${bad.id}/retry`).send({}).expect(200);
    const ooc = (
      await http()
        .post(`${path}/actions`)
        .send({ ...input(), interactionMode: 'OUT_OF_CHARACTER' })
        .expect(201)
    ).body;
    expect(ooc.status).toBe('COMPLETED');
    expect(
      (await http().get(`${path}/narrative-state`)).body.objectives[0]
        .completed,
    ).toBe(false);
  });
  it('blocks stale proposals when the session pauses during the provider call', async () => {
    const { path } = await setup();
    const normal = turn.getMockImplementation()!;
    turn.mockImplementation(async (r) => {
      if (r.stage === 'PROPOSE')
        await http().post(`${path}/pause`).send({}).expect(200);
      return normal(r);
    });
    const result = (
      await http().post(`${path}/actions`).send(input()).expect(201)
    ).body;
    expect(result.status).toBe('PENDING');
    expect((await http().get(`${path}/messages`)).body.data).toHaveLength(1);
  });
});
