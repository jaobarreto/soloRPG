import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq } from 'drizzle-orm';
import { abilities, scenePlanSchema } from '@solo-rpg/shared-contracts';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { DatabaseService } from '../../src/database/database.service';
import { GameEngineService } from '../../src/game-engine/game-engine.service';
import { AiServiceClient } from '../../src/integrations/ai-service/ai-service.client';
import { RANDOM_SOURCE } from '../../src/blue-rose/mechanics/dice/blue-rose-dice';
import * as g from '../../src/database/game-schema';
import * as n from '../../src/database/narrative-schema';
import * as arcana from '../../src/database/arcana-schema';
import { sessionMessages } from '../../src/database/schema';
import { legacyCampaign } from '../fixtures/legacy-campaign';

describe('TEST-AI56-003 Python graph → NestJS → real engine → PostgreSQL → renderer', () => {
  let app: INestApplication, db: DatabaseService, engine: GameEngineService;
  let proposal: object;
  const turn = jest.fn(async (input) => {
    const child = spawnSync(
      resolve(__dirname, '../../../ai-service/.venv/bin/python'),
      ['-m', 'app.evaluation.replay'],
      {
        cwd: resolve(__dirname, '../../../ai-service'),
        encoding: 'utf8',
        input: JSON.stringify({ request: input, proposal }),
        timeout: 15000,
      },
    );
    if (child.status !== 0)
      throw new Error(
        `Offline Python bridge failed: ${child.stderr.slice(0, 1000)}`,
      );
    return JSON.parse(child.stdout);
  });
  const http = () => request(app.getHttpServer());
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AiServiceClient)
      .useValue({ turn })
      .overrideProvider(RANDOM_SOURCE)
      .useValue({ d6: () => 4 })
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    db = app.get(DatabaseService);
    engine = app.get(GameEngineService);
    await migrate(db.db, {
      migrationsFolder: resolve(__dirname, '../../drizzle'),
    });
  });
  afterAll(async () => {
    await app?.close();
  });
  async function setup(tn = 10) {
    const c = await legacyCampaign(app, 2, 'Cenário sintético 5.6');
    const s = c.sessions[0]!.id;
    let active = false;
    const local = (command: unknown) =>
      engine.executeInternal({
        campaignId: c.id,
        ...(active ? { sessionId: s } : {}),
        commandId: randomUUID(),
        command,
      });
    const pc = (
      await local({
        type: 'CHARACTER_CREATE',
        kind: 'PROTAGONIST',
        known: true,
        sheet: {
          commandId: randomUUID(),
          name: 'Naelis',
          people: 'Human',
          background: 'Fixture',
          characterClass: 'ADEPT',
          level: 1,
          maxHealth: 30,
          abilities: Object.fromEntries(abilities.map((a) => [a, 2])),
        },
      })
    ).id;
    const door = randomUUID(),
      option = randomUUID();
    await local({
      type: 'WORLD_UPSERT',
      entityId: door,
      kind: 'OBJECT',
      name: 'Porta',
      description: 'Madeira com uma assinatura visível.',
      status: 'CLOSED',
      accessible: true,
      visibility: 'PUBLIC',
      privateNotes: 'PRIVATE_MECHANISM',
      reason: 'Preparação sintética',
    });
    await local({
      type: 'SCENE_CONFIGURE',
      targetSessionId: s,
      plan: scenePlanSchema.parse({
        opening: 'Uma sala diante de uma porta.',
        presentCharacterIds: [pc],
        options: [
          {
            id: option,
            intent: 'Examinar a porta',
            mode: 'ACT',
            targetEntityId: door,
            keywords: ['examinar'],
            check: {
              ability: 'PERCEPTION',
              focusId: null,
              targetNumber: tn,
              secret: false,
            },
            successText: 'Mecanismo identificado por teste oficial.',
            failureText: 'A tentativa não identificou o mecanismo.',
            witnesses: [],
            effects: [],
          },
        ],
        objectives: [
          {
            id: randomUUID(),
            description: 'Descobrir o mecanismo',
            requiredOptionIds: [option],
          },
        ],
      }),
    });
    const path = `/api/v1/campaigns/${c.id}/sessions/${s}`;
    await http().post(`${path}/start`).send({}).expect(200);
    active = true;
    return { c: c.id, s, path, pc, door, option, local };
  }
  const free = (
    intent: string,
    tool: object,
    expression = 'DIRECT',
    evidence: string[] = [],
    target: object | null = null,
  ) => ({
    kind: 'FREE',
    intent,
    description: 'Tentativa sintética',
    target,
    tool,
    expression,
    evidence,
  });
  const send = (path: string, content: string, extra: object = {}) =>
    http()
      .post(`${path}/actions`)
      .send({
        actionId: randomUUID(),
        interactionMode: 'ACT',
        content,
        ...extra,
      })
      .expect(201);
  const stored = async (id: string) =>
    (
      await db.db
        .select()
        .from(n.narrativeActions)
        .where(eq(n.narrativeActions.id, id))
    )[0]!;
  const events = (c: string) =>
    db.db.select().from(g.gameEvents).where(eq(g.gameEvents.campaignId, c));

  it('TEST-SEM5611 explicitly records incompatible arcana parameters and retries without applying a shield', async () => {
    const ctx = await setup();
    await db.db.insert(g.characterFeatures).values([
      { characterId: ctx.pc, ruleId: 'psychic-shield' },
      { characterId: ctx.pc, ruleId: 'shaping-talent' },
    ]);
    proposal = free('ARCANA', {
      type: 'ARCANA',
      arcanum: 'psychic-shield',
      raised: true,
      tradition: 'PSYCHIC',
    });
    const before = await events(ctx.c);
    const actionId = randomUUID();
    const body = {
      actionId,
      interactionMode: 'ACT',
      content: 'Eu ergo meu Escudo.',
    };
    await send(ctx.path, body.content, body);
    const action = await stored(actionId);
    const [message] = await db.db
      .select()
      .from(sessionMessages)
      .where(eq(sessionMessages.id, action.playerMessageId));
    expect(message?.metadata?.freeResolution).toMatchObject({
      category: 'CLARIFY',
      selectionReason: 'ARCANA_PARAMETER_MISMATCH',
    });
    expect(action.proposal).toMatchObject({ tool: { tradition: 'PSYCHIC' } });
    await send(ctx.path, body.content, body);
    await http()
      .post(`${ctx.path}/actions/${actionId}/retry`)
      .send({})
      .expect(200);
    expect(await events(ctx.c)).toEqual(before);
    expect(
      await db.db
        .select()
        .from(arcana.arcaneEffects)
        .where(eq(arcana.arcaneEffects.characterId, ctx.pc)),
    ).toHaveLength(0);
    expect(
      await db.db
        .select()
        .from(g.diceRolls)
        .where(eq(g.diceRolls.campaignId, ctx.c)),
    ).toHaveLength(0);
  });

  it('TEST-SEM5611 preserves legitimate shield execution and its idempotency', async () => {
    const ctx = await setup();
    await db.db.insert(g.characterFeatures).values([
      { characterId: ctx.pc, ruleId: 'psychic-shield' },
      { characterId: ctx.pc, ruleId: 'shaping-talent' },
    ]);
    proposal = free('ARCANA', {
      type: 'ARCANA',
      arcanum: 'psychic-shield',
      raised: false,
    });
    const body = {
      actionId: randomUUID(),
      interactionMode: 'ACT',
      content: 'Eu baixo meu Escudo.',
    };
    const first = await send(ctx.path, body.content, body);
    expect(first.body.status).toBe('COMPLETED');
    const before = await events(ctx.c);
    await send(ctx.path, body.content, body);
    await http()
      .post(`${ctx.path}/actions/${body.actionId}/retry`)
      .send({})
      .expect(200);
    expect(await events(ctx.c)).toEqual(before);
    const effects = await db.db
      .select()
      .from(arcana.arcaneEffects)
      .where(eq(arcana.arcaneEffects.characterId, ctx.pc));
    expect(effects).toHaveLength(1);
    expect(effects[0]!.value).toEqual({ raised: false });
    expect(
      await db.db
        .select()
        .from(g.diceRolls)
        .where(eq(g.diceRolls.campaignId, ctx.c)),
    ).toHaveLength(0);
  });

  it('TEST-SEM5611 memory questions retrieve a confirmed discovery without another investigation or roll', async () => {
    const ctx = await setup();
    proposal = free(
      'INVESTIGATE',
      { type: 'PREPARED_CHECK', capability: 'Examinar a porta' },
      'DIRECT',
      [],
      { type: 'WORLD', name: 'Porta' },
    );
    const pending = await send(ctx.path, 'Investigo a porta.');
    await http()
      .post(`${ctx.path}/actions/${pending.body.id}/roll`)
      .send({})
      .expect(200);
    const { NarrativeContextService } =
      await import('../../src/narrative/context.service');
    const snapshot = await app.get(NarrativeContextService).build(ctx.c, ctx.s);
    const source = snapshot.selection.information.find(
      (s) => s.scope === 'KNOWN' && s.text.includes('Mecanismo identificado'),
    )!;
    expect(source).toBeDefined();
    const before = await events(ctx.c);
    proposal = free(
      'QUERY',
      { type: 'QUERY', subject: 'MEMORY' },
      'QUESTION',
      [source.key],
      { type: 'WORLD', name: 'Porta' },
    );
    const answer = await send(
      ctx.path,
      'O que eu já descobri sobre essa porta?',
    );
    expect(answer.body.status).toBe('COMPLETED');
    expect((await stored(answer.body.id)).confirmed!.narrative).toBe(
      source.text,
    );
    expect(await events(ctx.c)).toEqual(before);
    expect(
      await db.db
        .select()
        .from(g.diceRolls)
        .where(eq(g.diceRolls.campaignId, ctx.c)),
    ).toHaveLength(1);
  });

  it.each(['move-object', 'wind-shaping'])(
    'TEST-SEM5611 cannot override a parameter refusal with a prepared %s context',
    async (arcanum) => {
      const ctx = await setup();
      await ctx.local({
        type: 'ARCANA_CONTEXT_SET',
        characterId: ctx.pc,
        contextId: randomUUID(),
        value:
          arcanum === 'move-object'
            ? { kind: 'OBJECT', massKg: 1, unattended: true, lineOfSight: true }
            : {
                kind: 'WIND',
                category: 0,
                radiusMeters: 12,
                lineOfSight: true,
              },
        reason: 'Contexto sintético para a recusa de parâmetro.',
      });
      const before = await events(ctx.c);
      proposal = free('ARCANA', {
        type: 'ARCANA',
        arcanum,
        raised: false,
        ...(arcanum === 'move-object' ? { fatigue: false } : { category: 0 }),
      });
      const answer = await send(
        ctx.path,
        'Tento usar o arcano com um parâmetro incompatível.',
      );
      const action = await stored(answer.body.id);
      const [message] = await db.db
        .select()
        .from(sessionMessages)
        .where(eq(sessionMessages.id, action.playerMessageId));
      expect(message?.metadata?.freeResolution).toMatchObject({
        category: 'CLARIFY',
        selectionReason: 'ARCANA_PARAMETER_MISMATCH',
      });
      expect(await events(ctx.c)).toEqual(before);
      expect(
        await db.db
          .select()
          .from(g.diceRolls)
          .where(eq(g.diceRolls.campaignId, ctx.c)),
      ).toHaveLength(0);
    },
  );

  it.each([10, 30])(
    'authorizes the prepared investigation, waits for the player and commits the real outcome once (TN %i)',
    async (tn) => {
      const ctx = await setup(tn);
      proposal = free(
        'INVESTIGATE',
        { type: 'PREPARED_CHECK', capability: 'Examinar a porta' },
        'DIRECT',
        [],
        { type: 'WORLD', name: 'Porta' },
      );
      const content = 'Examino a #Porta procurando algo estranho.';
      const start = content.indexOf('#');
      const body = {
        actionId: randomUUID(),
        interactionMode: 'ACT',
        content,
        mentions: [
          {
            type: 'WORLD',
            entityId: ctx.door,
            label: 'Porta',
            literal: '#Porta',
            start,
            end: start + 6,
          },
        ],
      };
      const pending = await send(ctx.path, content, body);
      expect(pending.body.status).toBe('AWAITING_ROLL');
      expect(
        (await events(ctx.c)).some(
          (e) => e.description === 'Mecanismo identificado por teste oficial.',
        ),
      ).toBe(false);
      await http()
        .post(`${ctx.path}/actions/${body.actionId}/roll`)
        .send({})
        .expect(200);
      const action = await stored(body.actionId);
      expect(action.success).toBe(tn === 10);
      expect(action.confirmed!.narrative).toBe(
        tn === 10
          ? 'Mecanismo identificado por teste oficial.'
          : 'A tentativa não identificou o mecanismo.',
      );
      const before = await events(ctx.c);
      await send(ctx.path, content, body);
      await http()
        .post(`${ctx.path}/actions/${body.actionId}/retry`)
        .send({})
        .expect(200);
      expect(await events(ctx.c)).toEqual(before);
      const rolls = await db.db
        .select()
        .from(g.diceRolls)
        .where(eq(g.diceRolls.campaignId, ctx.c));
      expect(rolls).toHaveLength(1);
      expect(
        (await http().get(`${ctx.path}/narrative-state`)).body
          .objectiveCompleted,
      ).toBe(tn === 10);
      const history = (await http().get(`${ctx.path}/messages`)).text;
      expect(history).not.toContain('PRIVATE_MECHANISM');
      const knowledge = await db.db
        .select()
        .from(n.characterKnowledge)
        .where(eq(n.characterKnowledge.characterId, ctx.pc));
      expect(knowledge.some((k) => k.source === 'WITNESSED')).toBe(tn === 10);
    },
  );

  it('rejects investigation-as-query and fabricated capabilities without new events or knowledge', async () => {
    const ctx = await setup();
    const before = await events(ctx.c);
    for (const tool of [
      { type: 'QUERY', subject: 'LOCATION' },
      { type: 'PREPARED_CHECK', capability: 'Invented test' },
    ]) {
      proposal = free('INVESTIGATE', tool);
      const result = await send(ctx.path, 'Procuro o mecanismo oculto.');
      expect((await stored(result.body.id)).status).toBe('COMPLETED');
    }
    expect(await events(ctx.c)).toEqual(before);
    expect(
      await db.db
        .select()
        .from(n.characterKnowledge)
        .where(eq(n.characterKnowledge.characterId, ctx.pc)),
    ).toHaveLength(0);
  });

  it.each(['QUESTION', 'HYPOTHETICAL', 'NEGATED', 'QUOTED', 'COMPOUND'])(
    'never executes a contradictory mechanical proposal marked %s',
    async (expression) => {
      const ctx = await setup();
      const before = await events(ctx.c);
      proposal = free(
        'ARCANA',
        { type: 'ARCANA', arcanum: 'psychic-shield', raised: true },
        expression,
      );
      await send(ctx.path, 'Como funciona Escudo?');
      expect(await events(ctx.c)).toEqual(before);
    },
  );

  it('retrieves a public source without a roll; OOC cannot embellish it or reveal a secret', async () => {
    const ctx = await setup();
    const { NarrativeContextService } =
      await import('../../src/narrative/context.service');
    const snapshot = await app.get(NarrativeContextService).build(ctx.c, ctx.s);
    const source = snapshot.selection.information.find(
      (s) => s.target?.name === 'Porta',
    )!;
    proposal = free('OBSERVE', { type: 'OBSERVE' }, 'DIRECT', [source.key], {
      type: 'WORLD',
      name: 'Porta',
    });
    const result = await send(
      ctx.path,
      'Examino a porta procurando a assinatura.',
    );
    expect((await stored(result.body.id)).confirmed!.narrative).toBe(
      source.text,
    );
    expect(
      await db.db
        .select()
        .from(g.diceRolls)
        .where(eq(g.diceRolls.campaignId, ctx.c)),
    ).toHaveLength(0);
    proposal = free(
      'QUERY',
      { type: 'QUERY', subject: 'RULES' },
      'QUESTION',
      [],
    );
    const ooc = await send(ctx.path, 'O que acontecerá no futuro?', {
      interactionMode: 'OUT_OF_CHARACTER',
    });
    expect((await stored(ooc.body.id)).confirmed!.narrative).toContain(
      'Não há informação autorizada',
    );
    expect((await http().get(`${ctx.path}/messages`)).text).not.toContain(
      'PRIVATE_MECHANISM',
    );
  });

  it('uses the current authorized context and falls back safely on a model contract error', async () => {
    const ctx = await setup();
    await db.db
      .update(g.worldEntities)
      .set({ accessible: false })
      .where(eq(g.worldEntities.id, ctx.door));
    proposal = free(
      'INVESTIGATE',
      { type: 'PREPARED_CHECK', capability: 'Examinar a porta' },
      'DIRECT',
      [],
      { type: 'WORLD', name: 'Porta' },
    );
    const result = await send(ctx.path, 'Examino a porta.');
    const [message] = await db.db
      .select()
      .from(sessionMessages)
      .where(eq(sessionMessages.id, result.body.playerMessageId));
    expect(message!.metadata?.freeResolution).toMatchObject({
      category: 'CLARIFY',
    });
    proposal = {
      kind: 'FREE',
      intent: 'ARCANA',
      command: { type: 'RESOURCE_SET' },
    };
    const invalid = await send(ctx.path, 'Uso minha magia nele.');
    expect((await stored(invalid.body.id)).confirmed!.narrative).toContain(
      'esclarecer',
    );
    expect(
      await db.db
        .select()
        .from(g.diceRolls)
        .where(eq(g.diceRolls.campaignId, ctx.c)),
    ).toHaveLength(0);
  });
});
