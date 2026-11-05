import {
  currentAdventure,
  defaultAdventure,
} from '../../src/adventures/gloamhale/default-adventure';
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { and, eq, sql } from 'drizzle-orm';
import { abilities, type ResolvedMention } from '@solo-rpg/shared-contracts';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { DatabaseService } from '../../src/database/database.service';
import { AdventureRegistry } from '../../src/adventures/core/registry/registry';
import { AdventureService } from '../../src/adventures/core/operations/adventure.service';
import { adventureEntityId } from '../../src/adventures/core/state/state';
import { adventureDefinitionSchema } from '../../src/adventures/core/definitions/definition';
import {
  gloamhaleModule,
  gloamhaleVersion,
} from '../../src/adventures/gloamhale/gloamhale-module';
import { gloamhaleV3 } from '../../src/adventures/gloamhale/definitions/v3/gloamhale-v3';
import { gloamhaleV4 } from '../../src/adventures/gloamhale/definitions/v4/gloamhale-v4';
import { gloamhaleV5 } from '../../src/adventures/gloamhale/definitions/v5/gloamhale-v5';
import { GameEngineService } from '../../src/game-engine/game-engine.service';
import { AiServiceClient } from '../../src/integrations/ai-service/ai-service.client';
import { RANDOM_SOURCE } from '../../src/blue-rose/mechanics/dice/blue-rose-dice';
import { testAdventure } from '../fixtures/adventure';
import * as g from '../../src/database/game-schema';
import * as n from '../../src/database/narrative-schema';
import { campaignSessions } from '../../src/database/schema';

const fact = (reference: string) => ({ type: 'FACT' as const, reference });
const option = {
  type: 'OPTION' as const,
  sceneKey: 'room',
  optionKey: 'light',
};
function fixture() {
  const definition = testAdventure();
  definition.version = 2;
  const first = {
    operator: 'ANY' as const,
    conditions: [
      { operator: 'ALL' as const, conditions: [option, fact('ready')] },
      fact('alternate'),
    ],
  };
  const terminal = {
    operator: 'ANY' as const,
    conditions: [fact('success'), fact('failure')],
  };
  return adventureDefinitionSchema.parse({
    ...definition,
    progression: {
      facts: [
        {
          key: 'withdraw',
          unitKey: 'first',
          description: 'Retirada definitiva',
          sourcePages: [1],
        },
        {
          key: 'ready',
          unitKey: 'first',
          description: 'Rota normal',
          sourcePages: [1],
          requires: option,
          exclusiveGroup: 'route',
        },
        {
          key: 'alternate',
          unitKey: 'first',
          description: 'Rota alternativa',
          sourcePages: [1],
          exclusiveGroup: 'route',
        },
        {
          key: 'secret',
          unitKey: 'first',
          description: 'SEGREDO OBJETIVO',
          sourcePages: [1],
        },
        {
          key: 'success',
          unitKey: 'second',
          description: 'Desfecho favorável',
          sourcePages: [1],
          exclusiveGroup: 'outcome',
        },
        {
          key: 'failure',
          unitKey: 'second',
          description: 'Desfecho desfavorável',
          sourcePages: [1],
          exclusiveGroup: 'outcome',
        },
      ],
      units: [
        {
          key: 'first',
          terminal: fact('withdraw'),
          weight: 1,
          completion: first,
          objectives: [
            {
              key: 'light',
              type: 'MAIN',
              description: 'Interno',
              publicDescription: 'Iluminar',
              completion: first,
              weight: 1,
            },
            {
              key: 'optional',
              type: 'OPTIONAL',
              description: 'SEGREDO OBJETIVO',
              completion: fact('secret'),
              weight: 1,
            },
          ],
        },
        {
          key: 'second',
          weight: 1,
          completion: terminal,
          terminal,
          objectives: [
            {
              key: 'end',
              type: 'MAIN',
              description: 'Interno',
              publicDescription: 'Resolver',
              completion: terminal,
              weight: 1,
            },
          ],
        },
      ],
    },
  });
}
describe('Phase 5.5 / objective sessions and contextual mentions / PostgreSQL', () => {
  let app: INestApplication,
    db: DatabaseService,
    adventure: AdventureService,
    engine: GameEngineService;
  const turn = jest.fn(async (input) => ({
    proposal:
      input.stage === 'PROPOSE'
        ? input.context.selectedOptionId
          ? { kind: 'SCENE', optionId: input.context.selectedOptionId }
          : {
              kind: 'FREE',
              intent: input.playerMessage.includes('usar')
                ? 'USE_ITEM'
                : 'TALK',
              description: 'Tentativa',
              target: {
                type: 'CHARACTER',
                name: input.playerMessage.includes('trocar')
                  ? 'Outro'
                  : 'Eileen',
              },
              tool: {
                type: input.playerMessage.includes('usar')
                  ? 'ADJUDICATE'
                  : 'DIALOGUE',
              },
            }
        : null,
    narration: input.stage === 'NARRATE' ? input.confirmed : null,
    usage: [],
    error: null,
  }));
  const http = () => request(app.getHttpServer());
  const local = (campaignId: string, command: unknown, sessionId?: string) =>
    engine.executeInternal({
      campaignId,
      sessionId,
      commandId: randomUUID(),
      command,
    });
  const command = (campaignId: string, rest: Record<string, unknown>) =>
    adventure.execute({ campaignId, commandId: randomUUID(), ...rest });
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AdventureRegistry)
      .useValue(
        new AdventureRegistry(
          [
            gloamhaleModule,
            gloamhaleVersion(gloamhaleV3),
            gloamhaleVersion(gloamhaleV4),
            gloamhaleVersion(gloamhaleV5),
            { definition: fixture(), entityNamespace: 'test-lantern' },
          ],
          { legacyImport: defaultAdventure, newCampaign: currentAdventure },
        ),
      )
      .overrideProvider(AiServiceClient)
      .useValue({ turn })
      .overrideProvider(RANDOM_SOURCE)
      .useValue({ d6: () => 4 })
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    db = app.get(DatabaseService);
    adventure = app.get(AdventureService);
    engine = app.get(GameEngineService);
    await migrate(db.db, {
      migrationsFolder: resolve(__dirname, '../../drizzle'),
    });
  });
  afterAll(async () => {
    await app?.close();
  });
  const sheet = (name: string) => ({
    commandId: randomUUID(),
    name,
    people: 'Human',
    background: 'Fixture',
    characterClass: 'ADEPT',
    level: 1,
    maxHealth: 23,
    abilities: Object.fromEntries(abilities.map((a) => [a, 2])),
  });
  async function setup() {
    const c = randomUUID();
    await command(c, {
      operation: 'IMPORT',
      adventureId: 'test-lantern',
      version: 2,
    });
    const pc = (
      await local(c, {
        type: 'CHARACTER_CREATE',
        kind: 'PROTAGONIST',
        known: true,
        sheet: sheet('Heroína'),
      })
    ).id;
    const npc = (
      await local(c, {
        type: 'CHARACTER_CREATE',
        kind: 'NPC',
        known: true,
        sheet: sheet('Eileen'),
      })
    ).id;
    const absent = (
      await local(c, {
        type: 'CHARACTER_CREATE',
        kind: 'NPC',
        known: true,
        sheet: sheet('Eileen'),
      })
    ).id;
    const secret = (
      await local(c, {
        type: 'CHARACTER_CREATE',
        kind: 'NPC',
        known: false,
        sheet: sheet('Segredo personagem'),
      })
    ).id;
    const item = (
      await local(c, {
        type: 'ITEM_CREATE',
        name: 'Lampião Azul',
        description: 'Lampião comum',
        consumable: false,
      })
    ).id;
    await local(c, {
      type: 'ITEM_GRANT',
      characterId: pc,
      itemId: item,
      quantity: 1,
      reason: 'Posse inicial',
    });
    await local(c, {
      type: 'COMBAT_CONFIGURE',
      characterId: pc,
      armorType: 'NONE',
      armorTrained: false,
      shieldType: 'NONE',
      shieldTrained: false,
      baseSpeed: 10,
      weaponTraining: ['staff'],
      reason: 'Perfil de teste',
    });
    const report = await adventure.status(c);
    expect(report.review.errors).toEqual([]);
    await command(c, {
      operation: 'REVIEW_PARTY',
      expectedDigest: report.snapshotDigest,
      sourceReview: 'Perfis originais revisados para testes.',
      manualRulesAccepted: true,
    });
    const s = adventureEntityId(c, 'session-1', 'test-lantern'),
      next = adventureEntityId(c, 'session-2', 'test-lantern');
    const path = `/api/v1/campaigns/${c}/sessions/${s}`,
      second = `/api/v1/campaigns/${c}/sessions/${next}`;
    await http().post(`${path}/start`).send({}).expect(200);
    const [plan] = await db.db
      .select()
      .from(n.sessionPlans)
      .where(eq(n.sessionPlans.sessionId, s));
    await db.db
      .update(n.sessionPlans)
      .set({ plan: { ...plan!.plan, presentCharacterIds: [pc, npc] } })
      .where(eq(n.sessionPlans.sessionId, s));
    return { c, s, next, path, second, pc, npc, absent, secret, item };
  }
  const proof = async (c: Awaited<ReturnType<typeof setup>>) =>
    (
      await local(
        c.c,
        {
          type: 'EVENT_RECORD',
          eventType: 'CONSEQUENCE_RECORDED',
          description: 'Consequência oficial da investigação.',
          participants: [c.pc],
          visibility: 'PUBLIC',
        },
        c.s,
      )
    ).id;
  const confirm = (
    c: Awaited<ReturnType<typeof setup>>,
    factKey: string,
    ids: string[],
    sessionId = c.s,
  ) =>
    command(c.c, {
      operation: 'CONFIRM_FACT',
      sessionId,
      factKey,
      reason: 'Critério narrativo atestado com eventos oficiais.',
      evidenceEventIds: ids,
    });
  const mention = (
    type: ResolvedMention['type'],
    id: string,
    label: string,
    start = 0,
  ): ResolvedMention => ({
    type,
    entityId: id,
    label,
    start,
    end: start + label.length + 1,
    literal: (type === 'CHARACTER' ? '@' : '#') + label,
  });
  const send = (path: string, content: string, mentions?: ResolvedMention[]) =>
    http()
      .post(`${path}/actions`)
      .send({
        actionId: randomUUID(),
        interactionMode: 'SPEAK',
        content,
        ...(mentions ? { mentions } : {}),
      });
  it('derives new campaign units from Gloamhale v5 and refuses count/duration configuration', async () => {
    const created = await http()
      .post('/api/v1/campaigns')
      .send({ title: 'Nova' })
      .expect(201);
    expect(created.body.sessions).toHaveLength(3);
    expect(created.body.plannedSessions).toBe(3);
    for (const extra of [
      { plannedSessions: 6 },
      { defaultSessionDurationMinutes: 120 },
    ])
      await http()
        .post('/api/v1/campaigns')
        .send({ title: 'Forjada', ...extra })
        .expect(400);
    expect(
      gloamhaleV5.sessions.every((s) => s.targetMinutes === undefined),
    ).toBe(true);
  });
  it('TEST-55-001/003/006/007 keeps the same chat after long time, pause and resume', async () => {
    const c = await setup();
    await db.db
      .update(campaignSessions)
      .set({ resumedAt: new Date(Date.now() - 48 * 3600000) })
      .where(eq(campaignSessions.id, c.s));
    await send(c.path, 'Olá Eileen').expect(201);
    await http().post(`${c.path}/pause`).send({}).expect(200);
    await http().post(`${c.path}/resume`).send({}).expect(200);
    const state = (await http().get(`${c.path}/narrative-state`)).body;
    expect(state.progress).toBe(0);
    expect(state.objectiveCompleted).toBe(false);
    expect(
      (await http().get(`${c.path}/messages`)).body.data.length,
    ).toBeGreaterThan(0);
    for (const operation of ['complete', 'finalize'])
      for (const endingType of [
        'PLAYER_REQUESTED',
        'NARRATIVE_PAUSE',
        'OBJECTIVE_COMPLETED',
      ])
        await http()
          .post(`${c.path}/${operation}`)
          .send({ endingType })
          .expect(409);
    await http().post(`${c.second}/start`).send({}).expect(409);
  });
  it('TEST-55-002/004/005/008/009/010/011/012 commits alternate closure once, preserves histories/memories and reaches terminal 100', async () => {
    const c = await setup();
    await send(c.path, '@Eileen, olá.', [
      mention('CHARACTER', c.npc, 'Eileen'),
    ]).expect(201);
    const event = await proof(c);
    const input = {
      operation: 'CONFIRM_FACT',
      campaignId: c.c,
      commandId: randomUUID(),
      sessionId: c.s,
      factKey: 'alternate',
      reason: 'Rota alternativa confirmada por consequência.',
      evidenceEventIds: [event],
    };
    await adventure.execute(input);
    await adventure.execute(input);
    const before = (await http().get(`${c.path}/narrative-state`)).body;
    expect(before.objectiveCompleted).toBe(true);
    expect(before.progress).toBe(90);
    expect(before.campaignProgress).toBeLessThan(100);
    expect(JSON.stringify(before)).not.toContain('SEGREDO');
    expect(before.objectives).toHaveLength(1);
    await http()
      .post(`${c.path}/finalize`)
      .send({ endingType: 'OBJECTIVE_COMPLETED' })
      .expect(200);
    await http()
      .post(`${c.path}/finalize`)
      .send({ endingType: 'OBJECTIVE_COMPLETED' })
      .expect(200);
    expect((await http().get(`${c.path}/narrative-state`)).body.progress).toBe(
      100,
    );
    const memoryBefore = await db.db
      .select()
      .from(n.characterKnowledge)
      .where(eq(n.characterKnowledge.characterId, c.npc));
    expect(memoryBefore.length).toBeGreaterThan(0);
    await http().post(`${c.second}/start`).send({}).expect(200);
    expect(
      await db.db
        .select()
        .from(n.characterKnowledge)
        .where(eq(n.characterKnowledge.characterId, c.npc)),
    ).toEqual(memoryBefore);
    expect(
      (await http().get(`${c.path}/messages`)).body.data.some(
        (m: { content: string }) => m.content.includes('@Eileen'),
      ),
    ).toBe(true);
    const end = await local(
      c.c,
      {
        type: 'EVENT_RECORD',
        eventType: 'CONSEQUENCE_RECORDED',
        description: 'Desfecho adverso confirmado.',
        visibility: 'PUBLIC',
        participants: [c.pc],
      },
      c.next,
    );
    await confirm(c, 'failure', [end.id], c.next);
    expect(
      (await http().get(`${c.second}/narrative-state`)).body.campaignProgress,
    ).toBeLessThan(100);
    await http()
      .post(`${c.second}/finalize`)
      .send({ endingType: 'OBJECTIVE_COMPLETED' })
      .expect(200);
    expect(
      (await http().get(`${c.path}/narrative-state`)).body.campaignProgress,
    ).toBe(100);
    expect(
      (await http().get(`${c.second}/narrative-state`)).body.campaignProgress,
    ).toBe(100);
    expect((await http().get(`/api/v1/campaigns/${c.c}`)).body.status).toBe(
      'COMPLETED',
    );
    expect(
      await db.db
        .select()
        .from(g.gameEvents)
        .where(
          and(
            eq(g.gameEvents.campaignId, c.c),
            eq(g.gameEvents.type, 'NARRATIVE_UNIT_COMPLETED'),
          ),
        ),
    ).toHaveLength(2);
  });
  it('confirms an early terminal withdrawal without unlocking unused units', async () => {
    const c = await setup();
    await confirm(c, 'withdraw', [await proof(c)]);
    await http()
      .post(`${c.path}/finalize`)
      .send({ endingType: 'OBJECTIVE_COMPLETED' })
      .expect(200);
    expect((await http().get(`/api/v1/campaigns/${c.c}`)).body.status).toBe(
      'COMPLETED',
    );
    expect(
      (await http().get(`${c.path}/narrative-state`)).body.campaignProgress,
    ).toBe(100);
    expect((await http().get(c.second)).body.status).toBe('LOCKED');
    await http().post(`${c.second}/start`).send({}).expect(409);
  });
  it('TEST-55-011 private fact descriptions and evidence remain absent from history, events and SSE', async () => {
    const c = await setup();
    const secret = await engine.executeInternal({
      campaignId: c.c,
      sessionId: c.s,
      commandId: randomUUID(),
      command: {
        type: 'EVENT_RECORD',
        eventType: 'CONSEQUENCE_RECORDED',
        description: 'PRIVATE_EVIDENCE_PHASE55',
        visibility: 'GM_ONLY',
        participants: [],
      },
    });
    const receipt = await confirm(c, 'secret', [secret.id]);
    if (!('id' in receipt))
      throw new Error('Expected fact confirmation receipt');
    const action = await send(c.path, '@Eileen, olá', [
      mention('CHARACTER', c.npc, 'Eileen'),
    ]);
    const planner = turn.mock.calls
      .filter(([input]) => input.stage === 'PROPOSE')
      .at(-1)![0];
    expect(
      planner.context.adventure.gm.director.objectives.some(
        (o: { description: string }) => o.description === 'SEGREDO OBJETIVO',
      ),
    ).toBe(true);
    const responses = await Promise.all([
      http().get(`${c.path}/narrative-state`),
      http().get(`${c.path}/messages`),
      http().get(`/api/v1/campaigns/${c.c}/events`),
      http().get(`${c.path}/actions/${action.body.id}/stream`),
    ]);
    for (const response of responses) {
      expect(response.status).toBe(200);
      for (const value of [
        'SEGREDO OBJETIVO',
        'PRIVATE_EVIDENCE_PHASE55',
        secret.id,
        receipt.id,
      ])
        expect(response.text).not.toContain(value);
    }
  });
  it('requires partial prerequisites, rejects conflicting outcomes and foreign/missing proof', async () => {
    const c = await setup(),
      event = await proof(c);
    await expect(confirm(c, 'ready', [event])).rejects.toThrow('prerequisites');
    await expect(confirm(c, 'alternate', [randomUUID()])).rejects.toThrow(
      'Evidence',
    );
    await http()
      .post(`${c.path}/actions`)
      .send({
        actionId: randomUUID(),
        interactionMode: 'ACT',
        content: 'Acender a lanterna',
        optionId: adventureEntityId(c.c, 'option-room-light', 'test-lantern'),
      })
      .expect(201);
    expect(
      (await http().get(`${c.path}/narrative-state`)).body.objectiveCompleted,
    ).toBe(false);
    await confirm(c, 'ready', [event]);
    await expect(confirm(c, 'alternate', [event])).rejects.toThrow(
      'Conflicting',
    );
    await expect(
      command(c.c, {
        operation: 'REVIEW_SESSION',
        sessionId: c.s,
        reason: 'Revisão genérica não é uma condição estruturada.',
        evidenceEventIds: [event],
      }),
    ).rejects.toThrow('explicit');
  });
  it('rolls back closure, next availability and audit together on persistence failure', async () => {
    const c = await setup();
    await confirm(c, 'alternate', [await proof(c)]);
    await db.db.execute(
      sql`CREATE FUNCTION reject_phase55_closure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.type = 'NARRATIVE_UNIT_COMPLETED' THEN RAISE EXCEPTION 'audit failure'; END IF; RETURN NEW; END $$`,
    );
    await db.db.execute(
      sql`CREATE TRIGGER reject_phase55_closure BEFORE INSERT ON game_events FOR EACH ROW EXECUTE FUNCTION reject_phase55_closure()`,
    );
    try {
      await http()
        .post(`${c.path}/finalize`)
        .send({ endingType: 'OBJECTIVE_COMPLETED' })
        .expect(500);
      expect((await http().get(c.path)).body.status).toBe('IN_PROGRESS');
      expect((await http().get(c.second)).body.status).toBe('LOCKED');
    } finally {
      await db.db.execute(
        sql`DROP TRIGGER reject_phase55_closure ON game_events`,
      );
      await db.db.execute(sql`DROP FUNCTION reject_phase55_closure()`);
    }
    await http()
      .post(`${c.path}/finalize`)
      .send({ endingType: 'OBJECTIVE_COMPLETED' })
      .expect(200);
  });
  it('TEST-55-013/014/015 contextual catalogs exclude secrets and include ordinary inventory/objects', async () => {
    const c = await setup();
    const object = randomUUID();
    await local(
      c.c,
      {
        type: 'WORLD_UPSERT',
        entityId: object,
        kind: 'OBJECT',
        name: 'Porta de Carvalho',
        description: 'Porta',
        status: 'CLOSED',
        accessible: true,
        visibility: 'PUBLIC',
        reason: 'Objeto público autorizado',
      },
      c.s,
    );
    const at = (
      await http().get(`${c.path}/mentions?symbol=%40&q=Ei`).expect(200)
    ).body.data;
    expect(at[0].entityId).toBe(c.npc);
    expect(at.some((m: { entityId: string }) => m.entityId === c.absent)).toBe(
      true,
    );
    expect(JSON.stringify(at)).not.toContain(c.secret);
    expect(
      (await http().get(`${c.path}/mentions?symbol=%23&q=lampiao`).expect(200))
        .body.data[0].entityId,
    ).toBe(c.item);
    expect(
      (await http().get(`${c.path}/mentions?symbol=%23&q=Porta`).expect(200))
        .body.data[0].entityId,
    ).toBe(object);
    expect(
      (await http().get(`${c.second}/mentions?symbol=%40`).expect(200)).body
        .data,
    ).toEqual([]);
    await http().get(`${c.path}/mentions?symbol=x`).expect(400);
  });
  it('TEST-55-016/021 rejects forged IDs/types/labels/spans, unknown NPCs and stale inventory before LLM invocation', async () => {
    const c = await setup();
    const calls = turn.mock.calls.length;
    for (const m of [
      mention('CHARACTER', randomUUID(), 'Eileen'),
      mention('CHARACTER', c.secret, 'Eileen'),
      mention('ITEM', c.npc, 'Eileen'),
      { ...mention('CHARACTER', c.npc, 'Eileen'), label: 'Outra' },
      { ...mention('CHARACTER', c.npc, 'Eileen'), end: 3 },
    ])
      await send(c.path, '@Eileen, olá', [m]).expect(400);
    await db.db
      .update(g.inventory)
      .set({ quantity: 0, equipped: false })
      .where(
        and(eq(g.inventory.characterId, c.pc), eq(g.inventory.itemId, c.item)),
      );
    await send(c.path, '#Lampião Azul', [
      mention('ITEM', c.item, 'Lampião Azul'),
    ]).expect(400);
    expect(turn.mock.calls.length).toBe(calls);
  });
  it('TEST-55-017/018/019/020 explicit homonyms bind correctly, absent ones cannot hear, multiple references persist and substitution is refused', async () => {
    const c = await setup();
    const explicit = await send(c.path, '@Eileen, olá', [
      mention('CHARACTER', c.npc, 'Eileen'),
    ]).expect(201);
    const [message] = await db.db
      .select()
      .from(n.narrativeActions)
      .where(eq(n.narrativeActions.id, explicit.body.id));
    expect(message!.status).toBe('COMPLETED');
    const heard = await db.db
      .select()
      .from(n.characterKnowledge)
      .where(eq(n.characterKnowledge.characterId, c.npc))
      .orderBy(n.characterKnowledge.eventId);
    expect(heard.length).toBeGreaterThan(0);
    await send(c.path, '@Eileen, olá', [
      mention('CHARACTER', c.absent, 'Eileen'),
    ]).expect(201);
    expect(
      await db.db
        .select()
        .from(n.characterKnowledge)
        .where(eq(n.characterKnowledge.characterId, c.absent)),
    ).toHaveLength(0);
    await send(c.path, '@Eileen, trocar alvo', [
      mention('CHARACTER', c.npc, 'Eileen'),
    ]).expect(201);
    expect(
      await db.db
        .select()
        .from(n.characterKnowledge)
        .where(eq(n.characterKnowledge.characterId, c.npc))
        .orderBy(n.characterKnowledge.eventId),
    ).toEqual(heard);
    const text = '@Eileen, usar #Lampião Azul';
    const refs = [
      mention('CHARACTER', c.npc, 'Eileen'),
      mention('ITEM', c.item, 'Lampião Azul', text.indexOf('#')),
    ];
    const result = await send(c.path, text, refs).expect(201);
    expect(
      (await http().get(`${c.path}/messages`)).body.data.find(
        (m: { id: string }) => m.id === result.body.playerMessageId,
      ).metadata.mentions,
    ).toEqual(refs);
    await send(c.path, 'Olá Eileen').expect(201);
    const last = turn.mock.calls
      .filter(([input]) => input.stage === 'PROPOSE')
      .at(-1)![0];
    expect(last.context.mentions).toEqual([]);
  });
});
