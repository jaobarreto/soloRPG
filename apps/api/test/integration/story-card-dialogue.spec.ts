import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { and, eq, sql } from 'drizzle-orm';
import {
  storyCardDialogueManifestSchema,
  type Narration,
  type NarrativeBeat,
} from '@solo-rpg/shared-contracts';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { DatabaseService } from '../../src/database/database.service';
import { AdventureRegistry } from '../../src/adventures/core/registry/registry';
import { AdventureService } from '../../src/adventures/core/operations/adventure.service';
import { GameEngineService } from '../../src/game-engine/game-engine.service';
import { AiServiceClient } from '../../src/integrations/ai-service/ai-service.client';
import { NarrativeContextService } from '../../src/narrative/context.service';
import { RANDOM_SOURCE } from '../../src/blue-rose/mechanics/dice/blue-rose-dice';
import { adventureEntityId } from '../../src/adventures/core/state/identity';
import { dialogueSourceHash } from '../../src/narrative/dialogue-content';
import * as a from '../../src/database/adventure-schema';
import * as g from '../../src/database/game-schema';
import * as n from '../../src/database/narrative-schema';
import { sessionMessages } from '../../src/database/schema';
import {
  storyDefinition,
  storyBothDefinition,
  storyFixture,
  storyManifest,
} from '../fixtures/story-card-dialogue';

type Input = {
  stage: string;
  context: Record<string, unknown>;
  confirmed: Narration | null;
};
describe('TEST-SCARD-001–020 opt-in Story Cards / HTTP / FastAPI graph / disposable PostgreSQL', () => {
  let app: INestApplication,
    db: DatabaseService,
    engine: GameEngineService,
    adventure: AdventureService;
  let proposal: object,
    attack: string | null = null,
    beforePublish: (() => Promise<void>) | null = null;
  let prompts: string[] = [];
  const evidence: object[] = [];
  const turn = jest.fn(async (input: Input) => {
    let payload: object = proposal;
    if (input.stage === 'NARRATE') {
      const rendering = input.context.rendering as {
        category: string;
        publication?: { choices: NarrativeBeat[] };
        dialogue?: { replies: { beat: NarrativeBeat }[] };
      };
      const choices = rendering?.publication?.choices ?? [];
      let beats: NarrativeBeat[] = [];
      if (rendering?.category === 'DIALOGUE') {
        const beat =
          rendering.dialogue?.replies[0]?.beat ??
          choices.find((b) => b.kind === 'DIALOGUE');
        if (beat) beats = [{ ...beat, factIds: [...beat.factIds] }];
        if (attack === 'text') beats[0]!.text += ' E a passagem surgiu.';
        if (attack === 'speaker') beats[0]!.speakerId = randomUUID();
        if (attack === 'facts') beats[0]!.factIds = [randomUUID()];
        if (attack === 'combine')
          beats.push(
            choices.find(
              (b) => b.kind === 'DIALOGUE' && b.text !== beats[0]!.text,
            )!,
          );
      } else if (rendering?.category === 'MECHANIC')
        beats = [choices.find((b) => b.kind === 'RESULT')!];
      if (attack === 'gallery')
        beats.push({
          kind: 'ATMOSPHERE',
          speakerId: null,
          factIds: [],
          text: 'Atrás da estante há uma galeria que conduz ao jardim.',
        });
      payload = beats.length
        ? {
            ...input.confirmed,
            narrative: beats.map((b) => b.text).join('\n\n'),
            beats,
          }
        : input.confirmed!;
    }
    const child = spawnSync(
      resolve(__dirname, '../../../ai-service/.venv/bin/python'),
      ['-m', 'app.evaluation.story_dialogue_replay'],
      {
        cwd: resolve(__dirname, '../../../ai-service'),
        input: JSON.stringify({ request: input, proposal: payload }),
        encoding: 'utf8',
        timeout: 15000,
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    if (child.status !== 0)
      throw new Error(`Local FastAPI graph bridge failed: ${child.stderr}`);
    const result = JSON.parse(child.stdout);
    prompts.push(...result.prompts);
    if (input.stage === 'NARRATE' && beforePublish) {
      const change = beforePublish;
      beforePublish = null;
      await change();
    }
    return result.response;
  });
  const http = () => request(app.getHttpServer());
  const local = (campaignId: string, command: unknown, sessionId?: string) =>
    engine.executeInternal({
      campaignId,
      commandId: randomUUID(),
      command,
      ...(sessionId ? { sessionId } : {}),
    });
  const command = (campaignId: string, rest: Record<string, unknown>) =>
    adventure.execute({ campaignId, commandId: randomUUID(), ...rest });
  beforeAll(async () => {
    if (
      !process.env.INTEGRATION_CONTAINER?.startsWith('solorpg-test-') ||
      !process.env.INTEGRATION_DATABASE_URL?.includes('/solorpg_test')
    )
      throw new Error('Disposable database required');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AdventureRegistry)
      .useValue(
        new AdventureRegistry(
          [storyDefinition, storyBothDefinition].map((definition) => ({
            definition,
            entityNamespace: definition.id,
          })),
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
    engine = app.get(GameEngineService);
    adventure = app.get(AdventureService);
    await migrate(db.db, {
      migrationsFolder: resolve(__dirname, '../../drizzle'),
    });
  });
  afterAll(async () => {
    writeFileSync(
      '/tmp/khaos563b1-story-results.json',
      JSON.stringify(
        {
          phase: '5.6.3B.1',
          evidenceKind:
            'HTTP_NEST_FASTAPI_PRODUCTION_GRAPH_SCRIPTED_PROVIDER_DISPOSABLE_POSTGRES',
          realProviderRequests: 0,
          evidence,
        },
        null,
        2,
      ) + '\n',
    );
    await app?.close();
  });
  async function setup(both = false, optIn = true) {
    attack = null;
    beforePublish = null;
    prompts = [];
    const definition = both ? storyBothDefinition : storyDefinition;
    const c = randomUUID();
    await command(c, {
      operation: 'IMPORT',
      adventureId: definition.id,
      version: definition.version,
    });
    const { id: pc } = await local(c, {
      type: 'CHARACTER_CREATE',
      kind: 'PROTAGONIST',
      known: true,
      sheet: {
        commandId: randomUUID(),
        name: 'Protagonista sintética',
        people: 'Humana',
        background: 'Fixture',
        characterClass: 'ADEPT',
        level: 1,
        maxHealth: 23,
        abilities: {
          ACCURACY: 0,
          COMMUNICATION: 1,
          CONSTITUTION: 1,
          DEXTERITY: 1,
          FIGHTING: 0,
          INTELLIGENCE: 3,
          PERCEPTION: 2,
          STRENGTH: 0,
          WILLPOWER: 2,
        },
        features: [
          { ruleId: 'cure' },
          { ruleId: 'healing-talent', degree: 'NOVICE' },
        ],
      },
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
      reason: 'Fixture mecânica existente.',
    });
    const report = await adventure.status(c);
    expect(report.review.errors).toEqual([]);
    await command(c, {
      operation: 'REVIEW_PARTY',
      expectedDigest: report.snapshotDigest,
      sourceReview: 'Ficha sintética revisada.',
      manualRulesAccepted: true,
    });
    const s = adventureEntityId(c, 'session-1', definition.id),
      s2 = adventureEntityId(c, 'session-2', definition.id);
    const path = `/api/v1/campaigns/${c}/sessions/${s}`;
    await http().post(`${path}/start`).send({}).expect(200);
    await db.db
      .update(a.adventureCast)
      .set({ known: true, currentState: 'UNRESOLVED' })
      .where(eq(a.adventureCast.campaignId, c));
    const events: string[] = [];
    for (const source of storyFixture.events) {
      const event = await local(
        c,
        {
          type: 'EVENT_RECORD',
          eventType: source.type,
          description: source.description,
          participants: [pc],
          visibility: source.visibility,
        },
        s,
      );
      events.push(event.id);
    }
    for (const row of storyFixture.adventureMemories) {
      const i = storyFixture.events.findIndex(
        (e: { id: string }) => e.id === row.eventId,
      );
      await db.db.insert(a.adventureMemories).values({
        campaignId: c,
        characterKey: row.characterKey,
        eventId: events[i]!,
      });
    }
    const manifest = storyManifest(c, definition, events[0]);
    const ctx = {
      c,
      pc,
      s,
      s2,
      path,
      definition,
      events,
      manifest,
      idA: manifest.bindings[0]!.entityId,
      idB: adventureEntityId(c, 'keeper-b', definition.id),
    };
    if (optIn) await saveManifest(ctx, manifest);
    return ctx;
  }
  type Ctx = Awaited<ReturnType<typeof setup>>;
  async function saveManifest(ctx: Ctx, manifest: unknown, s = ctx.s) {
    const parsed = storyCardDialogueManifestSchema.safeParse(manifest);
    if (parsed.success || manifest === null) {
      const [runtime] = await db.db
        .select()
        .from(a.adventureScenes)
        .where(eq(a.adventureScenes.sessionId, s));
      await command(ctx.c, {
        operation: 'SCENE',
        sessionId: s,
        sceneKey: runtime!.sceneKey,
        reason: 'Vínculo sintético explicitamente revisado para a cena.',
        storyCardDialogue: parsed.success ? parsed.data : null,
      });
      return;
    }
    const [row] = await db.db
      .select()
      .from(n.sessionPlans)
      .where(eq(n.sessionPlans.sessionId, s));
    // Negative cases deliberately bypass preparation validation to emulate stale/corrupt stored data.
    await db.db
      .update(n.sessionPlans)
      .set({
        plan: sql`${JSON.stringify({ ...row!.plan, storyCardDialogue: manifest })}::jsonb`,
      })
      .where(eq(n.sessionPlans.sessionId, s));
  }
  const snapshot = (ctx: Ctx) =>
    app.get(NarrativeContextService).build(ctx.c, ctx.s);
  async function converse(
    ctx: Ctx,
    topic = 'promise',
    name = 'Lior',
    id?: string,
    act = 'ANSWER',
  ) {
    proposal = {
      kind: 'FREE',
      intent: 'TALK',
      description: 'Conversar',
      expression: 'QUESTION',
      evidence: [],
      target: { type: 'CHARACTER', name },
      tool: { type: 'DIALOGUE', topic, act },
    };
    const body = {
      actionId: randomUUID(),
      interactionMode: 'SPEAK',
      content: `@${name}, o que você ouviu?`,
      ...(id
        ? {
            mentions: [
              {
                type: 'CHARACTER',
                entityId: id,
                label: name,
                literal: `@${name}`,
                start: 0,
                end: name.length + 1,
              },
            ],
          }
        : {}),
    };
    const response = await http()
      .post(`${ctx.path}/actions`)
      .send(body)
      .expect(201);
    expect(response.body.status).toBe('COMPLETED');
    const [action] = await db.db
      .select()
      .from(n.narrativeActions)
      .where(eq(n.narrativeActions.id, body.actionId));
    const [message] = await db.db
      .select()
      .from(sessionMessages)
      .where(eq(sessionMessages.id, action!.masterMessageId!));
    return { body, message: message!, response: response.body };
  }
  const rows = (table: typeof g.gameEvents, ctx: Ctx) =>
    db.db
      .select()
      .from(table)
      .where(eq(table.campaignId, ctx.c))
      .orderBy(table.sequence);
  async function unchangedState(ctx: Ctx) {
    return {
      world: await db.db
        .select()
        .from(g.worldEntities)
        .where(eq(g.worldEntities.campaignId, ctx.c)),
      health: await db.db
        .select()
        .from(g.characterResources)
        .where(eq(g.characterResources.characterId, ctx.pc)),
      inventory: await db.db
        .select()
        .from(g.inventory)
        .where(eq(g.inventory.campaignId, ctx.c)),
      relations: await db.db
        .select()
        .from(g.relationships)
        .where(eq(g.relationships.campaignId, ctx.c)),
      progress: await app.get(NarrativeContextService).progress(ctx.c, ctx.s),
    };
  }

  it('TEST-SCARD-001/006/008/011/016 valid opt-in uses own HEARD source, public menu and exact attributed persistence', async () => {
    const ctx = await setup();
    const before = await unchangedState(ctx);
    const result = await converse(ctx);
    expect(result.message.metadata?.renderingValidation).toBe('ACCEPTED');
    expect(result.message.metadata?.deterministicFallback).toBe(false);
    expect(result.message.content).toContain(
      'Da promessa, posso retomar o que ouvi; não um resultado confirmado',
    );
    expect(result.message.content).toContain(
      storyFixture.events[0].description,
    );
    expect(await unchangedState(ctx)).toEqual(before);
    expect(prompts.length).toBe(2);
    const sent = prompts.join('\n');
    for (const forbidden of [
      'PRIVATE_',
      'STATIC_CARD_KNOWLEDGE',
      'OTHER_NPC_ONLY',
      'bindingVersion',
      'definitionDigest',
      'entityNamespace',
      'synthetic-test-preparer',
    ])
      expect(sent).not.toContain(forbidden);
    const events = await rows(g.gameEvents, ctx);
    const reply = events.find((e) => e.type === 'NPC_REPLY_RECORDED')!;
    expect(reply.changes).toMatchObject({
      speaker: {
        kind: 'STORY_CARD',
        entityId: ctx.idA,
      },
    });
    const cast = await db.db
      .select()
      .from(a.adventureMemories)
      .where(eq(a.adventureMemories.eventId, reply.id));
    expect(cast.map((c) => c.characterKey)).toEqual(['keeper-a']);
    const participants = await db.db
      .select()
      .from(g.eventParticipants)
      .where(eq(g.eventParticipants.eventId, reply.id));
    expect(participants.map((p) => p.characterId)).toEqual([ctx.pc]);
    const characters = await db.db
      .select()
      .from(g.characters)
      .where(eq(g.characters.campaignId, ctx.c));
    expect(characters).toHaveLength(1);
    const publicMessages = (
      await http().get(`${ctx.path}/messages`).expect(200)
    ).body.data;
    expect(
      publicMessages.find((m: { id: string }) => m.id === result.message.id)
        .metadata,
    ).not.toHaveProperty('dialogueProvenance');
    expect(result.message.metadata?.dialogueProvenance).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          owner: expect.objectContaining({ entityId: ctx.idA }),
        }),
      ]),
    );
    const publicEvents = (
      await http().get(`/api/v1/campaigns/${ctx.c}/events`).expect(200)
    ).body;
    expect(JSON.stringify(publicEvents)).not.toContain('definitionDigest');
    expect(JSON.stringify(publicEvents)).not.toContain('entityNamespace');
    evidence.push({
      test: 'TEST-SCARD-001/006/008/011/016',
      published: result.message.content,
      event: reply,
      modelPrompts: prompts,
    });
  });
  it('TEST-SCARD-002/003 known but absent or state-incompatible cannot receive a contextual reply', async () => {
    const ctx = await setup();
    await db.db
      .update(a.adventureCast)
      .set({ known: false })
      .where(
        and(
          eq(a.adventureCast.campaignId, ctx.c),
          eq(a.adventureCast.key, 'keeper-a'),
        ),
      );
    expect((await snapshot(ctx)).dialogue).toBeUndefined();
    await db.db
      .update(a.adventureCast)
      .set({ known: true })
      .where(
        and(
          eq(a.adventureCast.campaignId, ctx.c),
          eq(a.adventureCast.key, 'keeper-a'),
        ),
      );
    const wrong = {
      ...ctx.manifest,
      bindings: [
        {
          ...ctx.manifest.bindings[0]!,
          characterKey: 'keeper-b',
          entityId: ctx.idB,
        },
      ],
    };
    await saveManifest(ctx, wrong);
    expect((await snapshot(ctx)).dialogue).toBeUndefined();
    const absent = await converse(ctx, 'promise', 'Líor', ctx.idB);
    expect(absent.message.content).not.toContain('Da promessa');
    expect(
      (await rows(g.gameEvents, ctx)).filter(
        (e) => e.type === 'NPC_REPLY_RECORDED',
      ),
    ).toEqual([]);
    await saveManifest(ctx, ctx.manifest);
    await db.db
      .update(a.adventureCast)
      .set({ currentState: 'UNAVAILABLE_REVIEWED' })
      .where(
        and(
          eq(a.adventureCast.campaignId, ctx.c),
          eq(a.adventureCast.key, 'keeper-a'),
        ),
      );
    expect((await snapshot(ctx)).dialogue).toBeUndefined();
    expect((await converse(ctx)).message.content).toContain(
      'Não há uma resposta autorizada',
    );
  });
  it('TEST-SCARD-004 exact mentions separate homonyms and select distinct reviewed voices', async () => {
    const ctx = await setup(true);
    await db.db.insert(a.adventureMemories).values({
      campaignId: ctx.c,
      characterKey: 'keeper-b',
      eventId: ctx.events[0]!,
    });
    const b = {
      ...ctx.manifest.bindings[0]!,
      characterKey: 'keeper-b',
      entityId: ctx.idB,
      voiceId: 'WARM' as const,
    };
    await saveManifest(ctx, {
      ...ctx.manifest,
      bindings: [...ctx.manifest.bindings, b],
    });
    expect((await converse(ctx)).message.content).toContain('A quem');
    const first = await converse(ctx, 'promise', 'Lior', ctx.idA);
    const second = await converse(ctx, 'promise', 'Líor', ctx.idB);
    expect(first.message.content).toContain('não um resultado confirmado');
    expect(second.message.content).toContain('Ela foi dita');
    const events = (await rows(g.gameEvents, ctx)).filter(
      (e) => e.type === 'NPC_REPLY_RECORDED',
    );
    expect(
      events.map(
        (e) =>
          (e.changes as { speaker: { entityId: string } }).speaker.entityId,
      ),
    ).toEqual([ctx.idA, ctx.idB]);
    evidence.push({
      test: 'TEST-SCARD-004',
      published: [first.message.content, second.message.content],
    });
  });
  it('TEST-SCARD-005/014/018 invalid scope, versions, duplicates, archetypes and missing keys fail closed', async () => {
    const ctx = await setup();
    const cases: unknown[] = [
      { ...ctx.manifest, campaignId: randomUUID() },
      { ...ctx.manifest, entityNamespace: 'other' },
      { ...ctx.manifest, definitionId: 'other:v1' },
      { ...ctx.manifest, definitionDigest: '0'.repeat(64) },
      { ...ctx.manifest, bindingVersion: 2 },
      {
        ...ctx.manifest,
        bindings: [{ ...ctx.manifest.bindings[0], contentVersion: 2 }],
      },
      {
        ...ctx.manifest,
        bindings: [...ctx.manifest.bindings, ...ctx.manifest.bindings],
      },
      ...['guards', 'missing'].map((key) => ({
        ...ctx.manifest,
        bindings: [
          {
            ...ctx.manifest.bindings[0],
            characterKey: key,
            entityId: adventureEntityId(ctx.c, key, ctx.definition.id),
          },
        ],
      })),
    ];
    for (const invalid of cases) {
      await saveManifest(ctx, invalid);
      expect((await snapshot(ctx)).dialogue).toBeUndefined();
    }
    await saveManifest(ctx, ctx.manifest);
    expect((await snapshot(ctx)).dialogue).toHaveLength(1);
  });
  it('TEST-SCARD-007/009/017 own association and exact public source are required; legacy consequences never prove participation', async () => {
    const ctx = await setup();
    for (const [index, key] of [
      [1, 'promise'],
      [2, 'promise'],
      [3, 'disagreement'],
    ] as const) {
      const source = storyFixture.events[index];
      const m = structuredClone(ctx.manifest);
      m.bindings[0]!.sources = [
        {
          key,
          kind: 'KNOWLEDGE',
          referenceId: ctx.events[index]!,
          descriptionHash: dialogueSourceHash(source.description),
        },
      ];
      await saveManifest(ctx, m);
      const menu = (await snapshot(ctx)).dialogue![0]!.choices;
      expect(menu.some((c) => c.topic === key)).toBe(false);
    }
    await saveManifest(ctx, ctx.manifest);
    await db.db
      .delete(a.adventureMemories)
      .where(
        and(
          eq(a.adventureMemories.campaignId, ctx.c),
          eq(a.adventureMemories.characterKey, 'keeper-a'),
          eq(a.adventureMemories.eventId, ctx.events[0]!),
        ),
      );
    expect((await converse(ctx)).message.content).toContain(
      'Não há uma resposta autorizada',
    );
  });
  it('TEST-SCARD-010 state changes after model selection revoke the fragment and never remember the rejected text', async () => {
    const ctx = await setup();
    beforePublish = async () => {
      await db.db
        .update(a.adventureCast)
        .set({ currentState: 'CHANGED_BY_OPERATOR' })
        .where(
          and(
            eq(a.adventureCast.campaignId, ctx.c),
            eq(a.adventureCast.key, 'keeper-a'),
          ),
        );
    };
    const result = await converse(ctx);
    expect(result.message.metadata?.deterministicFallback).toBe(true);
    expect(result.message.content).not.toContain('Da promessa');
    const replies = (await rows(g.gameEvents, ctx)).filter(
      (e) => e.type === 'NPC_REPLY_RECORDED',
    );
    expect(replies[0]!.description).not.toContain('Da promessa');
    expect(replies[0]!.changes).toMatchObject({
      speaker: { kind: 'STORY_CARD', entityId: ctx.idA },
    });
  });
  it.each(['text', 'speaker', 'facts', 'combine'])(
    'TEST-SCARD-011 adulteration %s is rejected without publication or memory of the draft',
    async (kind) => {
      const ctx = await setup();
      attack = kind;
      const result = await converse(ctx);
      expect(result.message.metadata?.deterministicFallback).toBe(true);
      expect(result.message.content).not.toContain('Da promessa');
      expect(result.message.content).not.toContain('passagem');
    },
  );
  it('TEST-SCARD-012 history survives two sessions and action replay creates no event, memory or provider request', async () => {
    const ctx = await setup();
    const result = await converse(ctx);
    const calls = turn.mock.calls.length;
    const events = await rows(g.gameEvents, ctx);
    const memories = await db.db
      .select()
      .from(a.adventureMemories)
      .where(eq(a.adventureMemories.campaignId, ctx.c))
      .orderBy(a.adventureMemories.characterKey, a.adventureMemories.eventId);
    await http().post(`${ctx.path}/actions`).send(result.body).expect(201);
    expect(turn.mock.calls.length).toBe(calls);
    expect(await rows(g.gameEvents, ctx)).toEqual(events);
    expect(
      await db.db
        .select()
        .from(a.adventureMemories)
        .where(eq(a.adventureMemories.campaignId, ctx.c))
        .orderBy(a.adventureMemories.characterKey, a.adventureMemories.eventId),
    ).toEqual(memories);

    await command(ctx.c, {
      operation: 'REVIEW_SESSION',
      sessionId: ctx.s,
      evidenceEventIds: [ctx.events[3]],
      reason:
        'Critérios sintéticos conferidos pelo operador, sem conclusão inferida da fala.',
    });
    await http()
      .post(`${ctx.path}/finalize`)
      .send({ endingType: 'OBJECTIVE_COMPLETED' })
      .expect(200);
    const finalizedHistory = (
      await http().get(`${ctx.path}/messages`).expect(200)
    ).body.data;
    await command(ctx.c, {
      operation: 'SCENE',
      sessionId: ctx.s2,
      sceneKey: 'study',
      reason: 'Retomada sintética explícita.',
    });
    const path = `/api/v1/campaigns/${ctx.c}/sessions/${ctx.s2}`;
    await http().post(`${path}/start`).send({}).expect(200);
    await saveManifest(ctx, ctx.manifest, ctx.s2);
    await converse({ ...ctx, s: ctx.s2, path });
    expect(
      (await http().get(`${ctx.path}/messages`).expect(200)).body.data,
    ).toEqual(finalizedHistory);
    expect((await snapshot({ ...ctx, s: ctx.s2 })).dialogue).toHaveLength(1);
  });
  it('TEST-SCARD-013 without manifest legacy dialogue still works and does not activate the new library', async () => {
    const ctx = await setup(false, false);
    expect((await snapshot(ctx)).dialogue).toBeUndefined();
    proposal = {
      kind: 'FREE',
      intent: 'TALK',
      description: 'Conversar',
      expression: 'DIRECT',
      evidence: [],
      target: { type: 'CHARACTER', name: 'Lior' },
      tool: { type: 'DIALOGUE' },
    };
    const result = await http()
      .post(`${ctx.path}/actions`)
      .send({
        actionId: randomUUID(),
        interactionMode: 'SPEAK',
        content: 'Lior, podemos conversar?',
      })
      .expect(201);
    expect(result.body.status).toBe('COMPLETED');
    const messages = (await http().get(`${ctx.path}/messages`).expect(200)).body
      .data;
    expect(messages.at(-1).content).toBe(
      'Lior — Prefiro cautela. O que despertou sua suspeita?',
    );
    expect(messages.at(-1).content).not.toContain('Da promessa');
  });
  it('TEST-SCARD-019 no FK coercion, shadow character, copied knowledge or descriptive relationship', async () => {
    const ctx = await setup();
    await db.db.insert(g.characters).values({
      id: ctx.idA,
      campaignId: ctx.c,
      kind: 'NPC',
      known: false,
      name: 'Colisão sintética',
      people: 'Humana',
      background: 'Teste',
      level: 1,
    });
    expect((await snapshot(ctx)).dialogue).toBeUndefined();
    expect((await converse(ctx)).message.content).toContain(
      'Não há uma resposta autorizada',
    );
    expect(
      await db.db
        .select()
        .from(n.characterKnowledge)
        .where(eq(n.characterKnowledge.characterId, ctx.idA)),
    ).toEqual([]);
    expect(
      await db.db
        .select()
        .from(g.relationships)
        .where(eq(g.relationships.campaignId, ctx.c)),
    ).toEqual([]);
  });
  it('TEST-SCARD-020 reprepare only reuses a valid same-scene manifest and never transports it through another scene', async () => {
    const ctx = await setup();
    const prepare = (sceneKey: string) =>
      command(ctx.c, {
        operation: 'SCENE',
        sessionId: ctx.s,
        sceneKey,
        reason: 'Repreparação sintética autorizada.',
      });
    await prepare('study');
    expect((await snapshot(ctx)).dialogue).toHaveLength(1);
    await prepare('courtyard');
    expect((await snapshot(ctx)).dialogue).toBeUndefined();
    await prepare('study');
    expect((await snapshot(ctx)).dialogue).toBeUndefined();
    await saveManifest(ctx, ctx.manifest);
    await saveManifest(ctx, null);
    expect((await snapshot(ctx)).dialogue).toBeUndefined();
    await saveManifest(ctx, { ...ctx.manifest, bindingVersion: 2 });
    await prepare('study');
    expect((await snapshot(ctx)).dialogue).toBeUndefined();
  });
  it('TEST-SCARD-015 gallery attack after an actual failed prepared check publishes only its official result', async () => {
    const ctx = await setup(true);
    attack = 'gallery';
    proposal = {
      kind: 'FREE',
      intent: 'INVESTIGATE',
      description: 'Examinar a estante',
      expression: 'DIRECT',
      evidence: [],
      target: null,
      tool: { type: 'PREPARED_CHECK', capability: 'Examinar a estante' },
    };
    const body = {
      actionId: randomUUID(),
      interactionMode: 'ACT',
      content: 'Examino a estante com o teste preparado.',
    };
    const pending = await http()
      .post(`${ctx.path}/actions`)
      .send(body)
      .expect(201);
    expect(pending.body.status).toBe('AWAITING_ROLL');
    const resolved = await http()
      .post(`${ctx.path}/actions/${body.actionId}/roll`)
      .send({})
      .expect(200);
    expect(resolved.body.status).toBe('COMPLETED');
    const messages = (await http().get(`${ctx.path}/messages`).expect(200)).body
      .data;
    expect(messages.at(-1).content).toBe(
      'A busca não identificou nenhuma abertura.',
    );
    expect(JSON.stringify(await rows(g.gameEvents, ctx))).not.toContain(
      'galeria',
    );
    expect(JSON.stringify(await snapshot(ctx))).not.toContain('galeria');
  });
  it('TEST-SCARD-009 public scene sources cannot be borrowed from another accessible location', async () => {
    const ctx = await setup();
    const m = structuredClone(ctx.manifest);
    m.bindings[0]!.choices.push({ topic: 'surroundings', act: 'ANSWER' });
    const loc = ctx.definition.locations[0]!;
    m.bindings[0]!.sources.push({
      key: 'surroundings',
      kind: 'PUBLIC',
      referenceId: adventureEntityId(ctx.c, loc.key, ctx.definition.id),
      descriptionHash: dialogueSourceHash(loc.description),
    });
    await saveManifest(ctx, m);
    expect((await converse(ctx, 'surroundings')).message.content).toContain(
      loc.description,
    );
    const future = ctx.definition.locations[1]!;
    const id = adventureEntityId(ctx.c, future.key, ctx.definition.id);
    await db.db
      .update(g.worldEntities)
      .set({ visibility: 'PUBLIC', accessible: true })
      .where(eq(g.worldEntities.id, id));
    m.bindings[0]!.sources[1] = {
      key: 'surroundings',
      kind: 'PUBLIC',
      referenceId: id,
      descriptionHash: dialogueSourceHash(future.description),
    };
    await saveManifest(ctx, m);
    expect((await converse(ctx, 'surroundings')).message.content).toContain(
      'Não há uma resposta autorizada',
    );
    expect(
      (await converse(ctx, 'conversation', 'Lior', undefined, 'REFUSE')).message
        .content,
    ).toContain('Não há uma resposta autorizada');
  });
  it('TEST-SCARD-012/016 persistence failure rolls back reply, cast memory and master message together', async () => {
    const ctx = await setup();
    proposal = {
      kind: 'FREE',
      intent: 'TALK',
      description: 'Conversar',
      expression: 'QUESTION',
      evidence: [],
      target: { type: 'CHARACTER', name: 'Lior' },
      tool: { type: 'DIALOGUE', topic: 'promise', act: 'ANSWER' },
    };
    const memories = await db.db
      .select()
      .from(a.adventureMemories)
      .where(eq(a.adventureMemories.campaignId, ctx.c))
      .orderBy(a.adventureMemories.characterKey, a.adventureMemories.eventId);
    await db.db.execute(
      sql`CREATE FUNCTION fail_story_master() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.role='GAME_MASTER' THEN RAISE EXCEPTION 'synthetic publish failure'; END IF; RETURN NEW; END $$`,
    );
    await db.db.execute(
      sql`CREATE TRIGGER fail_story_master BEFORE INSERT ON session_messages FOR EACH ROW EXECUTE FUNCTION fail_story_master()`,
    );
    const retryId = randomUUID();
    try {
      const result = await http()
        .post(`${ctx.path}/actions`)
        .send({
          actionId: retryId,
          interactionMode: 'SPEAK',
          content: 'Lior, o que ouviu?',
        })
        .expect(201);
      expect(result.body.status).toBe('COMMITTED');
    } finally {
      await db.db.execute(sql`DROP FUNCTION fail_story_master() CASCADE`);
    }
    expect(
      (await rows(g.gameEvents, ctx)).filter(
        (e) => e.type === 'NPC_REPLY_RECORDED',
      ),
    ).toEqual([]);
    const after = await db.db
      .select()
      .from(a.adventureMemories)
      .where(eq(a.adventureMemories.campaignId, ctx.c))
      .orderBy(a.adventureMemories.characterKey, a.adventureMemories.eventId);
    expect(
      after.filter((m) => memories.some((old) => old.eventId === m.eventId)),
    ).toHaveLength(memories.length);
    expect(after).toHaveLength(memories.length + 1); // the committed player speech remains; rejected reply does not.
    expect(
      (await http().get(`${ctx.path}/messages`).expect(200)).body.data.every(
        (m: { role: string }) => m.role !== 'GAME_MASTER',
      ),
    ).toBe(true);
    await http()
      .post(`${ctx.path}/actions/${retryId}/retry`)
      .send({})
      .expect(200);
    expect(
      (await rows(g.gameEvents, ctx)).filter(
        (e) => e.type === 'NPC_REPLY_RECORDED',
      ),
    ).toHaveLength(1);
    expect(
      await db.db
        .select()
        .from(a.adventureMemories)
        .where(eq(a.adventureMemories.campaignId, ctx.c))
        .orderBy(a.adventureMemories.characterKey, a.adventureMemories.eventId),
    ).toHaveLength(memories.length + 2);
  });
});
