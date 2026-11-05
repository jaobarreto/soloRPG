import { legacyCampaign } from '../fixtures/legacy-campaign';
import 'reflect-metadata';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
import { RANDOM_SOURCE } from '../../src/blue-rose/mechanics/dice/blue-rose-dice';
import {
  abilities,
  publicCharacterSchema,
  publicRollSchema,
} from '@solo-rpg/shared-contracts';

describe('Blue Rose engine / PostgreSQL / HTTP boundary', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let engine: GameEngineService;
  const random = { d6: jest.fn(() => 4) };
  const boot = async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RANDOM_SOURCE)
      .useValue(random)
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    db = app.get(DatabaseService);
    engine = app.get(GameEngineService);
  };
  const http = () => request(app.getHttpServer());
  const create = () => legacyCampaign(app, 2, 'Aldis');
  const sheet = () => ({
    commandId: randomUUID(),
    name: 'Lia',
    people: 'Human',
    characterClass: 'EXPERT',
    background: 'Aldis',
    level: 1,
    abilities: Object.fromEntries(abilities.map((a) => [a, 2])),
    maxHealth: 30,
    features: [
      { ruleId: 'dexterity-stealth' },
      { ruleId: 'artificer', degree: 'NOVICE' },
    ],
    languages: ['Aldin'],
    goals: ['Encontrar a família'],
  });
  const admin = (
    campaignId: string,
    command: Record<string, unknown>,
    sessionId?: string,
    commandId = randomUUID(),
  ) => engine.executeInternal({ campaignId, sessionId, commandId, command });
  const start = (c: { id: string; sessions: { id: string }[] }, n = 0) =>
    http()
      .post(`/api/v1/campaigns/${c.id}/sessions/${c.sessions[n]!.id}/start`)
      .send({})
      .expect(200);
  beforeAll(async () => {
    if (!process.env.INTEGRATION_DATABASE_URL)
      throw new Error('Use pnpm test:integration');
    process.env.DATABASE_URL = process.env.INTEGRATION_DATABASE_URL;
    await boot();
    await migrate(db.db, { migrationsFolder: resolve('drizzle') });
    await migrate(db.db, { migrationsFolder: resolve('drizzle') });
  });
  afterAll(async () => {
    if (app) await app.close();
  });
  it('creates a manual sheet, persists its relations and rejects admin field injection', async () => {
    const c = await create();
    const base = `/api/v1/campaigns/${c.id}`;
    for (const body of [
      {},
      { ...sheet(), kind: 'NPC' },
      { ...sheet(), privateNotes: 'secret' },
      { ...sheet(), abilities: { ACCURACY: 1 } },
      { ...sheet(), maxHealth: 0 },
      { ...sheet(), features: [{ ruleId: 'unknown' }] },
      { ...sheet(), features: [{ ruleId: 'artificer' }] },
    ])
      await http().post(`${base}/characters`).send(body).expect(400);
    const input = sheet();
    const created = await http()
      .post(`${base}/characters`)
      .send(input)
      .expect(201);
    expect(publicCharacterSchema.safeParse(created.body).success).toBe(true);
    expect(created.body.abilities.DEXTERITY).toBe(2);
    expect(created.body.features).toHaveLength(2);
    expect(created.body.resources[0]).toEqual({
      name: 'HEALTH',
      current: 30,
      maximum: 30,
    });
    expect(
      (await http().post(`${base}/characters`).send(input).expect(201)).body,
    ).toEqual(created.body);
    await http()
      .post(`${base}/characters`)
      .send({ ...input, name: 'Changed' })
      .expect(409);
    await http().post(`${base}/characters`).send(sheet()).expect(409);
    await http()
      .patch(`/api/v1/characters/${created.body.id}`)
      .send({ commandId: randomUUID(), abilities: { STRENGTH: 30 } })
      .expect(400);
    await http()
      .patch(`/api/v1/characters/${created.body.id}`)
      .send({ commandId: randomUUID(), name: 'Liana', goals: ['Voltar'] })
      .expect(200);
    const before = await http()
      .get(`/api/v1/characters/${created.body.id}`)
      .expect(200);
    await app.close();
    await boot();
    expect(
      (await http().get(`/api/v1/characters/${created.body.id}`).expect(200))
        .body,
    ).toEqual(before.body);
    await start(c);
    await http().post(`${base}/characters`).send(sheet()).expect(409);
  });
  it('preserves the world, relationships, inventory, events and old chat across two sessions and restart', async () => {
    const c = await create(),
      base = `/api/v1/campaigns/${c.id}`;
    const pc = (
      await http().post(`${base}/characters`).send(sheet()).expect(201)
    ).body;
    const npc = await admin(c.id, {
      type: 'CHARACTER_CREATE',
      sheet: { ...sheet(), name: 'Theron' },
      kind: 'NPC',
      known: true,
      privateNotes: 'Hidden allegiance',
      privateObjectives: 'Keep the gate closed',
    });
    const hidden = await admin(c.id, {
      type: 'CHARACTER_CREATE',
      sheet: { ...sheet(), name: 'Secret adversary' },
      kind: 'ADVERSARY',
      known: false,
      privateNotes: 'HIDDEN',
    });
    await http().get(`/api/v1/characters/${hidden.id}`).expect(404);
    const locationId = randomUUID();
    await admin(c.id, {
      type: 'METRIC_DEFINE',
      name: 'trust',
      minimum: -100,
      maximum: 100,
    });
    const item = await admin(c.id, {
      type: 'ITEM_CREATE',
      name: 'Ração',
      description: 'Provisões narrativas',
      consumable: true,
    });
    await start(c);
    const sessionId = c.sessions[0]!.id;
    await http()
      .post(`${base}/sessions/${sessionId}/messages`)
      .send({ content: 'Vamos para a taverna', interactionMode: 'ACT' })
      .expect(201);
    await admin(
      c.id,
      {
        type: 'ITEM_GRANT',
        characterId: pc.id,
        itemId: item.id,
        quantity: 3,
        reason: 'Provisões iniciais',
      },
      sessionId,
    );
    await admin(
      c.id,
      {
        type: 'RESOURCE_SET',
        characterId: pc.id,
        name: 'HEALTH',
        current: 24,
        maximum: 30,
        reason: 'Transcrição manual da mesa',
      },
      sessionId,
    );
    await admin(
      c.id,
      {
        type: 'CONDITION_APPLY',
        characterId: pc.id,
        name: 'Molhada',
        description: 'Chuva',
        visibility: 'PUBLIC',
        reason: 'Travessia',
      },
      sessionId,
    );
    await admin(
      c.id,
      {
        type: 'RELATIONSHIP_SET',
        fromCharacterId: pc.id,
        toCharacterId: npc.id,
        metric: 'trust',
        value: 20,
        reason: 'Lia ajudou Theron',
        visibility: 'PUBLIC',
      },
      sessionId,
    );
    await admin(
      c.id,
      {
        type: 'WORLD_UPSERT',
        entityId: locationId,
        kind: 'LOCATION',
        name: 'Taverna',
        description: 'Incêndio',
        status: 'DESTROYED',
        accessible: false,
        privateNotes: 'Secret passage',
        visibility: 'PUBLIC',
        reason: 'Fogo',
      },
      sessionId,
    );
    await admin(
      c.id,
      {
        type: 'EVENT_RECORD',
        eventType: 'ENCOUNTER_RECORDED',
        description: 'Encontro na estrada',
        participants: [pc.id, npc.id],
        visibility: 'PUBLIC',
      },
      sessionId,
    );
    const key = randomUUID();
    const rollBody = { commandId: key, sessionId };
    const rolled = await http()
      .post(`${base}/blue-rose/rolls`)
      .send(rollBody)
      .expect(201);
    expect(publicRollSchema.safeParse(rolled.body).success).toBe(true);
    expect(rolled.body.dice).toEqual([4, 4, 4]);
    expect(rolled.body.stuntPoints).toBe(0);
    expect(
      (await http().post(`${base}/blue-rose/rolls`).send(rollBody).expect(201))
        .body.id,
    ).toBe(rolled.body.id);
    const invUrl = `/api/v1/characters/${pc.id}/inventory/actions`;
    const consume = {
      commandId: randomUUID(),
      sessionId,
      itemId: item.id,
      action: 'CONSUME',
      quantity: 1,
    };
    await Promise.all([
      http().post(invUrl).send(consume).expect(201),
      http().post(invUrl).send(consume).expect(201),
    ]);
    await http()
      .post(invUrl)
      .send({ ...consume, commandId: randomUUID(), quantity: 99 })
      .expect(409);
    await http()
      .post(`${base}/sessions/${sessionId}/complete`)
      .send({ endingType: 'PLAYER_REQUESTED' })
      .expect(200);
    await start(c, 1);
    await http()
      .post(`${base}/blue-rose/rolls`)
      .send({ commandId: randomUUID(), sessionId })
      .expect(409);
    await app.close();
    const container = process.env.INTEGRATION_CONTAINER;
    if (!container?.startsWith('solorpg-test-'))
      throw new Error('Missing isolated container');
    execFileSync('docker', ['restart', container], { stdio: 'ignore' });
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        execFileSync(
          'docker',
          ['exec', container, 'pg_isready', '-U', 'test', '-d', 'solorpg_test'],
          { stdio: 'ignore' },
        );
        ready = true;
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    expect(ready).toBe(true);
    await boot();
    const current = (
      await http().get(`/api/v1/characters/${pc.id}`).expect(200)
    ).body;
    expect(current.resources[0].current).toBe(24);
    expect(current.inventory[0].quantity).toBe(2);
    expect(current.conditions[0].name).toBe('Molhada');
    expect(
      (await http().get(`${base}/relationships`).expect(200)).body[0].value,
    ).toBe(20);
    expect(
      (await http().get(`${base}/world-state`).expect(200)).body[0],
    ).toMatchObject({ id: locationId, status: 'DESTROYED', accessible: false });
    const history = (
      await http().get(`${base}/sessions/${sessionId}/messages`).expect(200)
    ).body.data;
    expect(history[0].content).toBe('Vamos para a taverna');
    expect(history.some((m: { role: string }) => m.role === 'SYSTEM')).toBe(
      true,
    );
    const events = (
      await http().get(`${base}/events?sessionId=${sessionId}`).expect(200)
    ).body.data;
    expect(
      events.some((e: { type: string }) => e.type === 'ENCOUNTER_RECORDED'),
    ).toBe(true);
    const exposed = JSON.stringify([
      current,
      events,
      (await http().get(`${base}/characters`)).body,
      (await http().get(`${base}/world-state`)).body,
    ]);
    for (const secret of [
      'Hidden allegiance',
      'Keep the gate closed',
      'Secret passage',
      'Secret adversary',
      'privateNotes',
      'privateObjectives',
    ])
      expect(exposed).not.toContain(secret);
  });
  it('resolves prepared checks with server modifiers and protects secret requests, rolls and metadata', async () => {
    const c = await create(),
      base = `/api/v1/campaigns/${c.id}`;
    const pc = (
      await http().post(`${base}/characters`).send(sheet()).expect(201)
    ).body;
    await start(c);
    const sessionId = c.sessions[0]!.id;
    const prepare = (visibility = 'PUBLIC', targetNumber = 16) =>
      admin(
        c.id,
        {
          type: 'CHECK_PREPARE',
          characterId: pc.id,
          ability: 'DEXTERITY',
          focusId: 'dexterity-stealth',
          targetNumber,
          modifier: 0,
          reason: visibility === 'GM_ONLY' ? 'SECRET-REASON' : 'Escalar',
          visibility,
          stuntsEligible: true,
        },
        sessionId,
      );
    const prepared = await prepare();
    const check = await http()
      .post(`${base}/blue-rose/checks`)
      .send({ commandId: randomUUID(), requestId: prepared.id })
      .expect(201);
    expect(check.body).toMatchObject({
      modifier: 4,
      total: 16,
      success: true,
      stuntPoints: 4,
      availableStuntPoints: 0,
    });
    await http()
      .post(`${base}/blue-rose/checks`)
      .send({ commandId: randomUUID(), requestId: prepared.id })
      .expect(409);
    const secret = await prepare('GM_ONLY');
    await http()
      .post(`${base}/blue-rose/checks`)
      .send({ commandId: randomUUID(), requestId: secret.id })
      .expect(404);
    await admin(
      c.id,
      { type: 'CHECK_RESOLVE', requestId: secret.id },
      sessionId,
    );
    const pending = await prepare('PLAYER_ONLY', 99);
    const failed = await http()
      .post(`${base}/blue-rose/checks`)
      .send({ commandId: randomUUID(), requestId: pending.id })
      .expect(201);
    expect(failed.body.success).toBe(false);
    expect(failed.body.stuntPoints).toBe(0);
    for (const endpoint of [
      'blue-rose/requests',
      'blue-rose/rolls',
      'events',
      `sessions/${sessionId}/messages`,
    ]) {
      const response = await http().get(`${base}/${endpoint}`).expect(200);
      expect(JSON.stringify(response.body)).not.toContain('SECRET-REASON');
      expect(JSON.stringify(response.body)).not.toContain(secret.id);
    }
    for (const payload of [
      { commandId: randomUUID(), sessionId, dice: [6, 6, 6] },
      { commandId: randomUUID(), sessionId, modifier: 20 },
      { commandId: randomUUID(), sessionId, visibility: 'GM_ONLY' },
    ])
      await http().post(`${base}/blue-rose/rolls`).send(payload).expect(400);
    await http()
      .post(`${base}/blue-rose/checks`)
      .send({
        commandId: randomUUID(),
        requestId: randomUUID(),
        targetNumber: 1,
      })
      .expect(400);
    for (const route of [
      'internal/commands',
      'admin/commands',
      'characters/' + pc.id + '/damage',
    ])
      await http()
        .post('/api/v1/' + route)
        .send({ damage: 100 })
        .expect(404);
  });
  it('validates inventory actions, transfers atomically and never applies unverified item effects', async () => {
    const c = await create(),
      other = await create(),
      base = `/api/v1/campaigns/${c.id}`;
    const pc = (
      await http().post(`${base}/characters`).send(sheet()).expect(201)
    ).body;
    const companion = await admin(c.id, {
      type: 'CHARACTER_CREATE',
      sheet: { ...sheet(), name: 'Companheira' },
      kind: 'COMPANION',
      known: true,
    });
    const hidden = await admin(c.id, {
      type: 'CHARACTER_CREATE',
      sheet: sheet(),
      kind: 'NPC',
      known: false,
    });
    const alien = await admin(other.id, {
      type: 'CHARACTER_CREATE',
      sheet: sheet(),
      kind: 'NPC',
      known: true,
    });
    const item = await admin(c.id, {
      type: 'ITEM_CREATE',
      name: 'Corda',
      description: 'Sem efeitos automáticos',
      consumable: false,
    });
    const secret = await admin(c.id, {
      type: 'ITEM_CREATE',
      name: 'Secret item',
      description: 'SECRET ITEM',
      consumable: false,
      visibility: 'GM_ONLY',
    });
    const food = await admin(c.id, {
      type: 'ITEM_CREATE',
      name: 'Fruta',
      description: 'Alimento narrativo',
      consumable: true,
    });
    await start(c);
    const sessionId = c.sessions[0]!.id;
    const grant = (itemId: string, quantity: number, characterId = pc.id) =>
      admin(
        c.id,
        {
          type: 'ITEM_GRANT',
          characterId,
          itemId,
          quantity,
          reason: 'Provisões',
        },
        sessionId,
      );
    await grant(item.id, 3);
    await grant(item.id, 1);
    await grant(secret.id, 1);
    await grant(food.id, 1);
    const url = `/api/v1/characters/${pc.id}/inventory/actions`;
    const action = (body: Record<string, unknown>) =>
      http()
        .post(url)
        .send({ commandId: randomUUID(), sessionId, itemId: item.id, ...body });
    await action({ action: 'EQUIP' }).expect(201);
    await action({ action: 'UNEQUIP' }).expect(201);
    await action({ action: 'EQUIP', quantity: 2 }).expect(400);
    await action({ action: 'EQUIP', toCharacterId: companion.id }).expect(400);
    await action({ action: 'CONSUME' }).expect(400);
    await action({
      action: 'CONSUME',
      itemId: food.id,
      toCharacterId: companion.id,
    }).expect(400);
    for (const toCharacterId of [undefined, pc.id])
      await action({ action: 'TRANSFER', toCharacterId }).expect(400);
    for (const toCharacterId of [hidden.id, alien.id])
      await action({ action: 'TRANSFER', toCharacterId }).expect(404);
    await action({ action: 'EQUIP', itemId: secret.id }).expect(404);
    await action({ action: 'EQUIP', itemId: randomUUID() }).expect(404);
    await action({ action: 'EQUIP', quantity: 0 }).expect(400);
    await action({ action: 'DAMAGE', damage: 100 }).expect(400);
    const transferred = {
      commandId: randomUUID(),
      sessionId,
      itemId: item.id,
      action: 'TRANSFER',
      toCharacterId: companion.id,
      quantity: 2,
    };
    await http().post(url).send(transferred).expect(201);
    await http().post(url).send(transferred).expect(201);
    await http()
      .post(url)
      .send({ ...transferred, quantity: 1 })
      .expect(409);
    const dest = (
      await http().get(`/api/v1/characters/${companion.id}`).expect(200)
    ).body;
    expect(dest.inventory[0].quantity).toBe(2);
    await action({
      action: 'TRANSFER',
      toCharacterId: companion.id,
      quantity: 1,
    }).expect(201);
    await grant(item.id, 9997, companion.id);
    await action({
      action: 'TRANSFER',
      toCharacterId: companion.id,
      quantity: 1,
    }).expect(409);
    await expect(grant(item.id, 10000)).rejects.toThrow('capacity');
    const before = (await http().get(`/api/v1/characters/${pc.id}`).expect(200))
      .body;
    expect(before.resources[0].current).toBe(30);
    expect(JSON.stringify(before)).not.toContain('SECRET ITEM');
    await http()
      .post(`/api/v1/characters/${companion.id}/inventory/actions`)
      .send({ ...transferred, commandId: randomUUID() })
      .expect(403);
    await http()
      .patch(`/api/v1/characters/${companion.id}`)
      .send({ commandId: randomUUID(), name: 'forged' })
      .expect(403);
    await action({ action: 'CONSUME', itemId: food.id }).expect(201);
    const after = (await http().get(`/api/v1/characters/${pc.id}`)).body;
    expect(
      after.inventory.some((i: { itemId: string }) => i.itemId === food.id),
    ).toBe(false);
    expect(after.resources).toEqual(before.resources);
    const events = (await http().get(`${base}/events?limit=100`)).body.data;
    expect(
      events.some((e: { type: string }) => e.type === 'ITEM_TRANSFERRED'),
    ).toBe(true);
  });
  it('validates internal commands and campaign boundaries, conditions and narrative state changes', async () => {
    const c = await create(),
      other = await create();
    const pc = (
      await http()
        .post(`/api/v1/campaigns/${c.id}/characters`)
        .send(sheet())
        .expect(201)
    ).body;
    const npc = await admin(c.id, {
      type: 'CHARACTER_CREATE',
      sheet: sheet(),
      kind: 'NPC',
      known: false,
      privateNotes: 'SECRET NOTES',
    });
    const outsider = await admin(other.id, {
      type: 'CHARACTER_CREATE',
      sheet: sheet(),
      kind: 'NPC',
      known: true,
    });
    await expect(
      admin(c.id, {
        type: 'RESOURCE_SET',
        characterId: pc.id,
        name: 'HEALTH',
        current: 31,
        maximum: 30,
        reason: 'Correção',
      }),
    ).rejects.toThrow('maximum');
    await expect(
      admin(c.id, {
        type: 'METRIC_DEFINE',
        name: 'trust',
        minimum: 5,
        maximum: 5,
      }),
    ).rejects.toThrow('range');
    await expect(
      admin(c.id, {
        type: 'RESOURCE_SET',
        characterId: outsider.id,
        name: 'HEALTH',
        current: 2,
        maximum: 30,
        reason: 'Correção',
      }),
    ).rejects.toThrow('not found');
    await expect(
      admin(c.id, { type: 'DAMAGE_APPLY', characterId: pc.id, damage: 99 }),
    ).rejects.toThrow();
    await expect(
      admin(c.id, {
        type: 'RESOURCE_SET',
        characterId: pc.id,
        name: 'HEALTH',
        current: 2,
        maximum: 30,
        reason: '',
      }),
    ).rejects.toThrow();
    await admin(c.id, {
      type: 'METRIC_DEFINE',
      name: 'trust',
      minimum: 0,
      maximum: 10,
    });
    await expect(
      admin(c.id, {
        type: 'METRIC_DEFINE',
        name: 'trust',
        minimum: 0,
        maximum: 10,
      }),
    ).rejects.toThrow('already defined');
    const rel = {
      type: 'RELATIONSHIP_SET',
      fromCharacterId: pc.id,
      toCharacterId: npc.id,
      metric: 'trust',
      value: 4,
      reason: 'Conversa',
      visibility: 'GM_ONLY',
    };
    await expect(admin(c.id, { ...rel, toCharacterId: pc.id })).rejects.toThrow(
      'distinct',
    );
    await expect(admin(c.id, { ...rel, value: 11 })).rejects.toThrow('outside');
    await expect(admin(c.id, { ...rel, metric: 'unknown' })).rejects.toThrow(
      'outside',
    );
    await admin(c.id, rel);
    await admin(c.id, { ...rel, value: 5 });
    await admin(c.id, {
      type: 'CHARACTER_REVEAL',
      characterId: npc.id,
      reason: 'Conheceu Lia',
    });
    const revealed = (
      await http().get(`/api/v1/characters/${npc.id}`).expect(200)
    ).body;
    expect(revealed.name).toBe('Lia');
    expect(JSON.stringify(revealed)).not.toContain('SECRET NOTES');
    const condition = await admin(c.id, {
      type: 'CONDITION_APPLY',
      characterId: pc.id,
      name: 'Secret condition',
      description: 'SECRET CONDITION',
      visibility: 'GM_ONLY',
      reason: 'Registro',
    });
    expect(
      (await http().get(`/api/v1/characters/${pc.id}`)).body.conditions,
    ).toHaveLength(0);
    await expect(
      admin(c.id, {
        type: 'CONDITION_REMOVE',
        characterId: npc.id,
        conditionId: condition.id,
        reason: 'Fim',
      }),
    ).rejects.toThrow('not found');
    await admin(c.id, {
      type: 'CONDITION_REMOVE',
      characterId: pc.id,
      conditionId: condition.id,
      reason: 'Fim',
    });
    const world = {
      type: 'WORLD_UPSERT',
      entityId: randomUUID(),
      kind: 'OBJECT',
      name: 'Porta',
      description: 'Porta antiga',
      status: 'LOCKED',
      accessible: false,
      privateNotes: 'SECRET DOOR',
      visibility: 'GM_ONLY',
      reason: 'Fechada',
    };
    await admin(c.id, world);
    await admin(c.id, { ...world, status: 'OPEN', accessible: true });
    await expect(admin(other.id, world)).rejects.toThrow('not found');
    expect(
      (await http().get(`/api/v1/campaigns/${c.id}/world-state`)).body,
    ).toEqual([]);
    const invisible = await admin(c.id, {
      type: 'CHARACTER_CREATE',
      sheet: sheet(),
      kind: 'NPC',
      known: false,
    });
    await admin(c.id, {
      type: 'EVENT_RECORD',
      eventType: 'CONSEQUENCE_RECORDED',
      description: 'SECRET CONSEQUENCE',
      participants: [invisible.id],
      visibility: 'PUBLIC',
    });
    const events = (
      await http().get(`/api/v1/campaigns/${c.id}/events?limit=100`)
    ).body.data;
    expect(JSON.stringify(events)).not.toContain('SECRET CONSEQUENCE');
    expect(JSON.stringify(events)).not.toContain('SECRET CONDITION');
    expect(events.map((e: { sequence: number }) => e.sequence)).toEqual(
      events.map((_: unknown, i: number) => i + 1),
    );
    await expect(
      admin(randomUUID(), {
        type: 'EVENT_RECORD',
        eventType: 'CONSEQUENCE_RECORDED',
        description: 'Nada',
        visibility: 'PUBLIC',
      }),
    ).rejects.toThrow('not found');
  });
  it('keeps TN, modifiers and focus selection server-side and enforces lifecycle and request scope', async () => {
    const c = await create(),
      base = `/api/v1/campaigns/${c.id}`,
      other = await create();
    const pc = (
      await http().post(`${base}/characters`).send(sheet()).expect(201)
    ).body;
    const npc = await admin(c.id, {
      type: 'CHARACTER_CREATE',
      sheet: sheet(),
      kind: 'NPC',
      known: true,
    });
    await start(c);
    const sessionId = c.sessions[0]!.id;
    const prepare = {
      type: 'CHECK_PREPARE',
      characterId: pc.id,
      ability: 'DEXTERITY',
      targetNumber: 10,
      reason: 'Teste',
      visibility: 'PUBLIC',
    };
    await expect(admin(c.id, prepare)).rejects.toThrow('session');
    await expect(admin(c.id, prepare, other.sessions[0]!.id)).rejects.toThrow(
      'not found',
    );
    await expect(
      admin(c.id, { ...prepare, focusId: 'perception-hearing' }, sessionId),
    ).rejects.toThrow('focus');
    await expect(
      admin(c.id, { ...prepare, focusId: 'artificer' }, sessionId),
    ).rejects.toThrow('focus');
    await admin(
      c.id,
      {
        type: 'ABILITY_SET',
        characterId: pc.id,
        ability: 'DEXTERITY',
        score: 3,
        reason: 'Correção da ficha',
      },
      sessionId,
    );
    const requested = await admin(c.id, { ...prepare, modifier: 2 }, sessionId);
    const resolved = await http()
      .post(`${base}/blue-rose/checks`)
      .send({ commandId: randomUUID(), requestId: requested.id })
      .expect(201);
    expect(resolved.body.modifier).toBe(5);
    expect(resolved.body.total).toBe(17);
    expect(resolved.body.stuntPoints).toBe(0);
    const npcCheck = await admin(
      c.id,
      { ...prepare, characterId: npc.id },
      sessionId,
    );
    await http()
      .post(`${base}/blue-rose/checks`)
      .send({ commandId: randomUUID(), requestId: npcCheck.id })
      .expect(403);
    await http()
      .post(`${base}/blue-rose/checks`)
      .send({ commandId: randomUUID(), requestId: randomUUID() })
      .expect(404);
    await http()
      .post(`/api/v1/campaigns/${other.id}/blue-rose/checks`)
      .send({ commandId: randomUUID(), requestId: requested.id })
      .expect(404);
    await http()
      .patch(`/api/v1/characters/${pc.id}`)
      .send({ commandId: randomUUID(), description: 'Nova descrição' })
      .expect(200);
    await http()
      .post(`${base}/sessions/${sessionId}/pause`)
      .send({})
      .expect(200);
    await http()
      .post(`${base}/blue-rose/rolls`)
      .send({ commandId: randomUUID(), sessionId })
      .expect(409);
    await http()
      .post(`${base}/sessions/${sessionId}/resume`)
      .send({})
      .expect(200);
    await http()
      .post(`${base}/sessions/${sessionId}/complete`)
      .send({ endingType: 'PLAYER_REQUESTED' })
      .expect(200);
    await start(c, 1);
    await http()
      .post(`${base}/sessions/${c.sessions[1]!.id}/complete`)
      .send({ endingType: 'PLAYER_REQUESTED' })
      .expect(200);
    await expect(
      admin(
        c.id,
        {
          type: 'EVENT_RECORD',
          eventType: 'ENCOUNTER_RECORDED',
          description: 'Late',
          visibility: 'PUBLIC',
        },
        sessionId,
      ),
    ).rejects.toThrow('completed');
  });
  it('paginates visible events and rolls without revealing hidden sequence gaps', async () => {
    const c = await create(),
      base = `/api/v1/campaigns/${c.id}`;
    const pc = (
      await http().post(`${base}/characters`).send(sheet()).expect(201)
    ).body;
    await start(c);
    const sessionId = c.sessions[0]!.id;
    const hidden = await admin(
      c.id,
      {
        type: 'CHECK_PREPARE',
        characterId: pc.id,
        ability: 'STRENGTH',
        targetNumber: 20,
        reason: 'SECRET PAGINATION',
        visibility: 'GM_ONLY',
      },
      sessionId,
    );
    await admin(
      c.id,
      { type: 'CHECK_RESOLVE', requestId: hidden.id },
      sessionId,
    );
    for (let i = 0; i < 3; i++)
      await http()
        .post(`${base}/blue-rose/rolls`)
        .send({ commandId: randomUUID(), sessionId })
        .expect(201);
    const first = (
      await http().get(`${base}/blue-rose/rolls?limit=1`).expect(200)
    ).body;
    expect(first.data).toHaveLength(1);
    expect(first.nextCursor).toBe(1);
    expect(first.hasMore).toBe(true);
    const last = (
      await http()
        .get(
          `${base}/blue-rose/rolls?limit=2&after=${first.nextCursor}&sessionId=${sessionId}`,
        )
        .expect(200)
    ).body;
    expect(last.data).toHaveLength(2);
    expect(last.nextCursor).toBeNull();
    expect(last.hasMore).toBe(false);
    const events = (await http().get(`${base}/events?limit=1`).expect(200))
      .body;
    expect(events.hasMore).toBe(true);
    expect(events.nextCursor).toBe(1);
    for (const endpoint of ['events', 'blue-rose/rolls']) {
      for (const suffix of [
        'limit=0',
        'after=-1',
        'after=0.5',
        'limit=101',
        'sessionId=no',
        'visibility=GM_ONLY',
      ])
        await http().get(`${base}/${endpoint}?${suffix}`).expect(400);
      await http()
        .get(`${base}/${endpoint}?sessionId=${randomUUID()}`)
        .expect(404);
      await http()
        .get(`/api/v1/campaigns/${randomUUID()}/${endpoint}`)
        .expect(404);
    }
    for (const endpoint of [
      'characters',
      'world-state',
      'relationships',
      'blue-rose/requests',
    ])
      await http()
        .get(`/api/v1/campaigns/${randomUUID()}/${endpoint}`)
        .expect(404);
    for (const endpoint of [
      '/api/v1/characters/invalid',
      '/api/v1/campaigns/invalid/events',
    ])
      await http().get(endpoint).expect(400);
    const rules = (await http().get('/api/v1/blue-rose/rules').expect(200))
      .body;
    expect(rules.some((r: { status: string }) => r.status === 'RECORDED')).toBe(
      true,
    );
    expect(
      (await http().get('/api/v1/blue-rose/stunts').expect(200)).body,
    ).toMatchObject({ status: 'PARTIAL' });
  });
  it('executes the real local CLI without exposing an admin HTTP surface', async () => {
    const c = await create();
    const directory = mkdtempSync(resolve(tmpdir(), 'solorpg-engine-cli-'));
    const commandFile = resolve(directory, 'command.json');
    execFileSync(
      process.execPath,
      [require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.build.json'],
      { stdio: 'pipe' },
    );
    try {
      const command = {
        campaignId: c.id,
        commandId: randomUUID(),
        command: {
          type: 'EVENT_RECORD',
          eventType: 'ENCOUNTER_RECORDED',
          description: 'CLI local verificada',
          visibility: 'PUBLIC',
        },
      };
      writeFileSync(commandFile, JSON.stringify(command), { mode: 0o600 });
      const invoke = () =>
        JSON.parse(
          execFileSync(
            process.execPath,
            [resolve('dist/game-engine/admin.js'), commandFile],
            {
              encoding: 'utf8',
              env: {
                ...process.env,
                DATABASE_URL: process.env.INTEGRATION_DATABASE_URL,
              },
            },
          ),
        );
      const receipt = invoke();
      expect(receipt.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(invoke()).toEqual(receipt);
      const events = (
        await http().get(`/api/v1/campaigns/${c.id}/events`).expect(200)
      ).body.data;
      expect(
        events.filter((e: { id: string }) => e.id === receipt.id),
      ).toHaveLength(1);
      writeFileSync(
        commandFile,
        JSON.stringify({
          ...command,
          command: {
            type: 'DAMAGE_APPLY',
            damage: 999,
            privateNotes: 'DO-NOT-PRINT',
          },
        }),
      );
      const invalid = spawnSync(
        process.execPath,
        [resolve('dist/game-engine/admin.js'), commandFile],
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            DATABASE_URL: process.env.INTEGRATION_DATABASE_URL,
          },
        },
      );
      expect(invalid.status).toBe(1);
      expect(invalid.stdout + invalid.stderr).not.toContain('DO-NOT-PRINT');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it('rolls back state and receipt when audit insert fails', async () => {
    const c = await create();
    const input = sheet();
    await db.db.execute(
      sql`CREATE FUNCTION reject_game_event_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit unavailable'; END $$`,
    );
    await db.db.execute(
      sql`CREATE TRIGGER reject_game_event_test BEFORE INSERT ON game_events FOR EACH ROW EXECUTE FUNCTION reject_game_event_test()`,
    );
    try {
      await http()
        .post(`/api/v1/campaigns/${c.id}/characters`)
        .send(input)
        .expect(500);
    } finally {
      await db.db.execute(
        sql`DROP TRIGGER reject_game_event_test ON game_events`,
      );
      await db.db.execute(sql`DROP FUNCTION reject_game_event_test()`);
    }
    expect(
      (await http().get(`/api/v1/campaigns/${c.id}/characters`)).body,
    ).toEqual([]);
    await http()
      .post(`/api/v1/campaigns/${c.id}/characters`)
      .send(input)
      .expect(201);
  });
});
