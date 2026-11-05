import { legacyCampaign } from '../fixtures/legacy-campaign';
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
import { RANDOM_SOURCE } from '../../src/blue-rose/mechanics/dice/blue-rose-dice';
import * as game from '../../src/database/game-schema';
import * as narrative from '../../src/database/narrative-schema';
import { campaignSessions } from '../../src/database/schema';
import { eq } from 'drizzle-orm';
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
    const campaign = await legacyCampaign(app, 2, 'Ecos');
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
    const sessionId = campaign.sessions[0]!.id;
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
  async function freeSetup() {
    let miraId = '';
    const fixture = await setup(false, async (c, _pc, plan) => {
      const mira = await admin(c.id, {
        type: 'CHARACTER_CREATE',
        kind: 'COMPANION',
        known: true,
        sheet: npcSheet('Mira'),
        personality: 'Serena, cautelosa; não concorda por cortesia.',
        motivations: 'Proteger seus companheiros.',
        privateNotes: 'SEGREDO_PRIVADO_DE_MIRA',
      });
      miraId = mira.id;
      plan.presentCharacterIds.push(mira.id);
      const secret = await admin(c.id, {
        type: 'EVENT_RECORD',
        eventType: 'CONSEQUENCE_RECORDED',
        description: 'SEGREDO_CONHECIDO_APENAS_POR_NAELIS',
        participants: [_pc.id],
        visibility: 'PLAYER_ONLY',
      });
      await db.db.insert(narrative.characterKnowledge).values({
        campaignId: c.id,
        characterId: _pc.id,
        eventId: secret.id,
        source: 'WITNESSED',
        importance: 90,
      });
      await admin(c.id, {
        type: 'SCENE_CONFIGURE',
        targetSessionId: c.sessions[1]!.id,
        plan,
      });
    });
    return { ...fixture, miraId };
  }
  const freeProposal = (
    intent: string,
    tool: object,
    target: object | null = null,
  ) => ({
    kind: 'FREE',
    intent,
    description: 'Intenção livre da jogadora',
    target,
    tool,
  });
  function freeProvider(proposal: object, line?: string) {
    turn.mockImplementation(async (r) => ({
      proposal: r.stage === 'PROPOSE' ? proposal : null,
      narration:
        r.stage === 'NARRATE' && r.context.rendering?.category === 'DIALOGUE'
          ? (() => {
              const approved = r.context.rendering.publication.choices.find(
                (b: { kind: string; factIds: string[] }) =>
                  b.kind === 'DIALOGUE' && !b.factIds.length,
              );
              const beat = line ? { ...approved, text: line } : approved;
              return {
                narrative: beat.text,
                eventIds: r.confirmed.eventIds,
                beats: [beat],
              };
            })()
          : r.stage === 'NARRATE'
            ? r.confirmed
            : null,
      usage: [],
      error: null,
    }));
  }
  it('publishes a composed NPC reply, records attributed dialogue, and preserves it across two chats', async () => {
    const { path, campaign, miraId, sessionId } = await freeSetup();
    freeProvider(
      freeProposal(
        'TALK',
        { type: 'DIALOGUE' },
        { type: 'CHARACTER', name: 'Mira' },
      ),
    );
    const body = {
      actionId: randomUUID(),
      interactionMode: 'SPEAK',
      content:
        'Mira, você acha que podemos confiar em Aren? Ele parece esconder alguma coisa.',
    };
    const first = (await http().post(`${path}/actions`).send(body).expect(201))
      .body;
    expect(first.status).toBe('COMPLETED');
    expect(turn).toHaveBeenCalledTimes(2);
    const render = turn.mock.calls.find(([r]) => r.stage === 'NARRATE')![0];
    expect(render.context.rendering.speaker.id).toBe(miraId);
    expect(render.context.rendering.speaker.personality).toContain('Serena');
    expect(JSON.stringify(render)).not.toContain('SEGREDO_');
    expect(render.context.adventure).toBeUndefined();
    const history = (await http().get(`${path}/messages`)).body.data;
    expect(history).toHaveLength(2);
    expect(history[1].content).toContain('despertou sua suspeita');
    expect(JSON.stringify(history)).not.toContain('freeResolution');
    await http().post(`${path}/actions`).send(body).expect(201);
    expect((await http().get(`${path}/messages`)).body.data).toEqual(history);
    const events = await db.db
      .select()
      .from(game.gameEvents)
      .where(eq(game.gameEvents.campaignId, campaign.id));
    expect(events.filter((e) => e.type === 'SPEECH_RECORDED')).toHaveLength(1);
    expect(events.filter((e) => e.type === 'NPC_REPLY_RECORDED')).toHaveLength(
      1,
    );
    const before = await app
      .get(NarrativeContextService)
      .build(campaign.id, sessionId);
    expect(
      before.characters
        .find((c) => c.id === miraId)!
        .knowledge.some((k) =>
          k.description.includes('despertou sua suspeita'),
        ),
    ).toBe(true);
    await http()
      .post(`${path}/finalize`)
      .send({ endingType: 'PLAYER_REQUESTED' })
      .expect(200);
    const second = `/api/v1/campaigns/${campaign.id}/sessions/${campaign.sessions[1]!.id}`;
    await http().post(`${second}/start`).send({}).expect(200);
    await http()
      .post(`${second}/actions`)
      .send({
        ...body,
        actionId: randomUUID(),
        content: 'Mira, ainda tenho dúvidas sobre Aren.',
      })
      .expect(201);
    const last = turn.mock.calls
      .filter(([r]) => r.stage === 'NARRATE')
      .at(-1)![0];
    expect(
      last.context.rendering.facts.some((f: { description: string }) =>
        f.description.includes('despertou sua suspeita'),
      ),
    ).toBe(true);
    expect((await http().get(`${path}/messages`)).body.data).toEqual(history);
  });
  it('clarifies an ambiguous arcanum without consuming resources or recording world events', async () => {
    const { path, campaign } = await freeSetup();
    freeProvider(
      freeProposal('ARCANA', {
        type: 'CLARIFY',
        question: 'Qual arcano deseja utilizar e em quem?',
      }),
    );
    const before = await db.db
      .select()
      .from(game.gameEvents)
      .where(eq(game.gameEvents.campaignId, campaign.id));
    const body = {
      actionId: randomUUID(),
      interactionMode: 'ACT',
      content: 'Quero usar minha magia nele.',
    };
    expect(
      (await http().post(`${path}/actions`).send(body).expect(201)).body.status,
    ).toBe('COMPLETED');
    expect(
      (await http().get(`${path}/messages`)).body.data.at(-1).content,
    ).toContain('Qual arcano');
    expect(
      await db.db
        .select()
        .from(game.gameEvents)
        .where(eq(game.gameEvents.campaignId, campaign.id)),
    ).toEqual(before);
  });
  it('resolves a free investigation through an authorized check and waits for the player dice', async () => {
    const { path } = await setup(true);
    freeProvider(
      freeProposal('INVESTIGATE', {
        type: 'PREPARED_CHECK',
        capability: 'Escalar a muralha',
      }),
    );
    const body = {
      actionId: randomUUID(),
      interactionMode: 'ACT',
      content: 'Procuro um apoio para subir e investigar o alto da muralha.',
    };
    const action = (await http().post(`${path}/actions`).send(body).expect(201))
      .body;
    expect(action.status).toBe('AWAITING_ROLL');
    expect(turn).toHaveBeenCalledTimes(1);
    await http().post(`${path}/actions/${action.id}/roll`).send({}).expect(200);
    await http().post(`${path}/actions/${action.id}/roll`).send({}).expect(200);
    const history = (await http().get(`${path}/messages`)).body.data;
    expect(
      history.filter((m: { role: string }) => m.role === 'SYSTEM'),
    ).toHaveLength(1);
    expect(
      history.filter((m: { role: string }) => m.role === 'GAME_MASTER'),
    ).toHaveLength(1);
    expect(JSON.stringify(history)).not.toContain('resolvedOptionId');
  });
  it('keeps OOC clarification separate even if the model proposes a mechanical tool', async () => {
    const { path, campaign } = await freeSetup();
    freeProvider(freeProposal('CORRECT', { type: 'REST', kind: 'SLEEP' }));
    const before = await db.db
      .select()
      .from(game.gameEvents)
      .where(eq(game.gameEvents.campaignId, campaign.id));
    const body = {
      actionId: randomUUID(),
      interactionMode: 'OUT_OF_CHARACTER',
      content: 'Eu quis observar, não dormir. Pode esclarecer?',
    };
    expect(
      (await http().post(`${path}/actions`).send(body).expect(201)).body.status,
    ).toBe('COMPLETED');
    expect(
      await db.db
        .select()
        .from(game.gameEvents)
        .where(eq(game.gameEvents.campaignId, campaign.id)),
    ).toEqual(before);
    const render = turn.mock.calls.find(([r]) => r.stage === 'NARRATE')![0];
    expect(render.context.rendering.speaker).toBeNull();
    expect(render.context.rendering.facts).toEqual([]);
  });
  it('falls back from invented outcomes and never records a rejected NPC reply', async () => {
    const { path, campaign } = await freeSetup();
    freeProvider(
      freeProposal(
        'TALK',
        { type: 'DIALOGUE' },
        { type: 'CHARACTER', name: 'Mira' },
      ),
      'Naelis aceita a proposta e recebe uma espada.',
    );
    const body = {
      actionId: randomUUID(),
      interactionMode: 'SPEAK',
      content: 'Mira, podemos conversar?',
    };
    expect(
      (await http().post(`${path}/actions`).send(body).expect(201)).body.status,
    ).toBe('COMPLETED');
    const history = (await http().get(`${path}/messages`)).body.data;
    expect(history.at(-1).metadata.deterministicFallback).toBe(true);
    expect(history.at(-1).content).not.toContain('espada');
    const events = await db.db
      .select()
      .from(game.gameEvents)
      .where(eq(game.gameEvents.campaignId, campaign.id));
    expect(events.filter((e) => e.type === 'NPC_REPLY_RECORDED')).toHaveLength(
      1,
    );
  });
  it('rolls back reply memories with a failed final message and retries only narration', async () => {
    const { path, campaign } = await freeSetup();
    freeProvider(
      freeProposal(
        'TALK',
        { type: 'DIALOGUE' },
        { type: 'CHARACTER', name: 'Mira' },
      ),
    );
    await db.db.execute(
      sql`CREATE FUNCTION phase54_reject_master() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.role = 'GAME_MASTER' THEN RAISE EXCEPTION 'synthetic persistence failure'; END IF; RETURN NEW; END $$`,
    );
    await db.db.execute(
      sql`CREATE TRIGGER phase54_reject_master BEFORE INSERT ON session_messages FOR EACH ROW EXECUTE FUNCTION phase54_reject_master()`,
    );
    const body = {
      actionId: randomUUID(),
      interactionMode: 'SPEAK',
      content: 'Mira, ainda podemos conversar?',
    };
    try {
      const action = (
        await http().post(`${path}/actions`).send(body).expect(201)
      ).body;
      expect(action.status).toBe('COMMITTED');
      const events = await db.db
        .select()
        .from(game.gameEvents)
        .where(eq(game.gameEvents.campaignId, campaign.id));
      expect(events.filter((e) => e.type === 'SPEECH_RECORDED')).toHaveLength(
        1,
      );
      expect(
        events.filter((e) => e.type === 'NPC_REPLY_RECORDED'),
      ).toHaveLength(0);
    } finally {
      await db.db.execute(
        sql`DROP TRIGGER phase54_reject_master ON session_messages`,
      );
      await db.db.execute(sql`DROP FUNCTION phase54_reject_master()`);
    }
    expect(
      (
        await http()
          .post(`${path}/actions/${body.actionId}/retry`)
          .send({})
          .expect(200)
      ).body.status,
    ).toBe('COMPLETED');
    expect(turn.mock.calls.filter(([r]) => r.stage === 'PROPOSE')).toHaveLength(
      1,
    );
    const events = await db.db
      .select()
      .from(game.gameEvents)
      .where(eq(game.gameEvents.campaignId, campaign.id));
    expect(events.filter((e) => e.type === 'NPC_REPLY_RECORDED')).toHaveLength(
      1,
    );
  });
  it('retains each NPC critical conflicts and rumor sources despite another NPC having over 60 memories', async () => {
    const npcs: string[] = [];
    const { campaign, sessionId, pc } = await setup(
      false,
      async (c, _pc, plan) => {
        for (const name of ['Theron', 'Moradora']) {
          const npc = await admin(c.id, {
            type: 'CHARACTER_CREATE',
            kind: 'NPC',
            known: true,
            sheet: npcSheet(name),
            personality: 'Cauteloso',
          });
          npcs.push(npc.id);
          plan.presentCharacterIds.push(npc.id);
        }
      },
    );
    const [last] = await db.db
      .select({ value: sql<number>`max(${game.gameEvents.publicSequence})` })
      .from(game.gameEvents)
      .where(sql`${game.gameEvents.campaignId} = ${campaign.id}`);
    let sequence = last!.value ?? 0;
    async function remember(
      characterId: string,
      description: string,
      source: string,
      importance: number,
    ) {
      const [event] = await db.db
        .insert(game.gameEvents)
        .values({
          campaignId: campaign.id,
          sessionId,
          commandId: randomUUID(),
          publicSequence: ++sequence,
          type: 'TEST_MEMORY',
          description,
          visibility: 'PLAYER_ONLY',
          changes: {},
        })
        .returning();
      await db.db.insert(narrative.characterKnowledge).values({
        campaignId: campaign.id,
        characterId,
        eventId: event!.id,
        source,
        importance,
      });
    }
    await remember(npcs[1]!, 'Discussão anterior com Naelis.', 'WITNESSED', 90);
    await remember(npcs[1]!, 'Talvez a janela esteja quebrada.', 'RUMOR', 90);
    await remember(
      pc.id,
      'Descoberta privada sem testemunhas.',
      'WITNESSED',
      90,
    );
    for (let i = 0; i < 65; i++)
      await remember(npcs[0]!, `Lembrança relevante ${i}`, 'HEARD', 95);
    const context = await app
      .get(NarrativeContextService)
      .build(campaign.id, sessionId);
    const npc = context.characters.find((c) => c.id === npcs[1])!;
    expect(npc.knowledge).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: 'Discussão anterior com Naelis.',
          source: 'WITNESSED',
        }),
        expect.objectContaining({
          description: 'Talvez a janela esteja quebrada.',
          source: 'RUMOR',
        }),
      ]),
    );
    expect(JSON.stringify(npc.knowledge)).not.toContain('Descoberta privada');
    expect(
      context.characters.find((c) => c.id === npcs[0])!.knowledge,
    ).toHaveLength(65);
    expect(context.characters.find((c) => c.id === pc.id)!.knowledge).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: 'Descoberta privada sem testemunhas.',
        }),
      ]),
    );
  });
  it('aggregates measured usage, rate limits and retries by turn without exposing prompts', async () => {
    const { path } = await setup();
    const normal = turn.getMockImplementation()!;
    const body = input();
    turn.mockResolvedValueOnce({
      proposal: null,
      narration: null,
      error: 'RATE_LIMIT',
      usage: [
        {
          provider: 'gemini',
          model: 'simulated',
          inputTokens: 0,
          outputTokens: 0,
          durationMs: 10,
          inputCharacters: 150,
          totalTokens: null,
          usageReported: false,
          error: 'RATE_LIMIT',
        },
      ],
    });
    expect(
      (await http().post(`${path}/actions`).send(body).expect(201)).body.status,
    ).toBe('PENDING');
    turn.mockImplementation(async (r) => ({
      ...(await normal(r)),
      usage:
        r.stage === 'PROPOSE'
          ? [
              {
                provider: 'gemini',
                model: 'simulated',
                inputTokens: 20,
                outputTokens: 5,
                totalTokens: 28,
                usageReported: true,
                inputCharacters: 150,
                durationMs: 30,
                error: null,
              },
            ]
          : [],
    }));
    await http()
      .post(`${path}/actions/${body.actionId}/retry`)
      .send({})
      .expect(200);
    const usage = (await http().get(`${path}/ai-usage`).expect(200)).body;
    expect(usage).toEqual([
      expect.objectContaining({
        provider: 'gemini',
        model: 'simulated',
        requests: 2,
        turns: 1,
        maxRequestsPerTurn: 2,
        inputTokens: 20,
        outputTokens: 5,
        totalTokens: 28,
        inputCharacters: 300,
        durationMs: 40,
        averageLatencyMs: 20,
        errors: 1,
        rateLimits: 1,
        usageReportedRequests: 1,
      }),
    ]);
    expect(JSON.stringify(usage)).not.toContain(body.content);
    await http().post(`${path}/actions`).send(body).expect(201);
    expect((await http().get(`${path}/ai-usage`)).body).toEqual(usage);
  });
  it('explains an unavailable model without losing the action or retrying it automatically', async () => {
    const { path } = await setup();
    turn.mockResolvedValue({
      proposal: null,
      narration: null,
      error: 'MODEL_UNAVAILABLE',
      usage: [],
    });
    const result = (
      await http().post(`${path}/actions`).send(input()).expect(201)
    ).body;
    expect(result.status).toBe('PENDING');
    expect(result.error).toContain('modelo do Mestre está indisponível');
    expect(result.error).toContain('configuração do provedor');
    expect(turn).toHaveBeenCalledTimes(1);
    expect((await http().get(`${path}/messages`)).body.data).toHaveLength(1);
  });
  it.each([
    {
      label: 'early objective',
      seconds: 0,
      done: true,
      ending: 'OBJECTIVE_COMPLETED',
      status: 200,
    },
    {
      label: 'pending after two hours',
      seconds: 7300,
      done: false,
      ending: 'OBJECTIVE_COMPLETED',
      status: 409,
    },
    {
      label: 'abandoned investigation',
      seconds: 100,
      done: false,
      ending: 'PLAYER_REQUESTED',
      status: 200,
    },
    {
      label: 'narrative pause',
      seconds: 100,
      done: false,
      ending: 'NARRATIVE_PAUSE',
      status: 200,
    },
    {
      label: 'explicit ending',
      seconds: 100,
      done: false,
      ending: 'PLAYER_REQUESTED',
      status: 200,
    },
    {
      label: 'prepared peaceful alternative',
      seconds: 100,
      done: true,
      ending: 'OBJECTIVE_COMPLETED',
      status: 200,
    },
  ])(
    'Director respects $label and never starts the next session by itself',
    async (scenario) => {
      const alternative = scenario.label === 'prepared peaceful alternative';
      const { path, campaign, sessionId } = await setup(
        false,
        async (_c, _pc, plan) => {
          if (alternative) {
            plan.options[0]!.keywords = ['negociar'];
            plan.options[0]!.intent = 'Negociar a passagem';
            plan.options[0]!.successText =
              'A passagem foi autorizada após o acordo.';
          }
        },
      );
      await db.db
        .update(campaignSessions)
        .set({ activeDurationSeconds: scenario.seconds })
        .where(eq(campaignSessions.id, sessionId));
      if (scenario.done)
        await http()
          .post(`${path}/actions`)
          .send({
            ...input(),
            ...(alternative ? { content: 'Quero negociar a passagem.' } : {}),
          })
          .expect(201);
      const state = (await http().get(`${path}/narrative-state`).expect(200))
        .body;
      expect(state.objectiveCompleted).toBe(scenario.done);
      expect(state.suggestSessionEnding).toBe(scenario.done);
      expect((await http().get(path)).body.status).toBe('IN_PROGRESS');
      await http()
        .post(`${path}/finalize`)
        .send({ endingType: scenario.ending })
        .expect(scenario.status);
      const second = `/api/v1/campaigns/${campaign.id}/sessions/${campaign.sessions[1]!.id}`;
      expect((await http().get(second)).body.status).toBe(
        scenario.status === 200 ? 'AVAILABLE' : 'LOCKED',
      );
      expect((await http().get(`${second}/messages`)).body.data).toHaveLength(
        0,
      );
    },
  );
  it('rolls back a failed summary persistence and recovers finalization without losing the transcript', async () => {
    const { path, campaign } = await setup();
    await http().post(`${path}/actions`).send(input()).expect(201);
    const history = (await http().get(`${path}/messages`)).body.data;
    await db.db.execute(
      sql`CREATE FUNCTION phase53_reject_summary() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.summary IS NOT NULL AND OLD.summary IS NULL THEN RAISE EXCEPTION 'summary failure'; END IF; RETURN NEW; END $$`,
    );
    await db.db.execute(
      sql`CREATE TRIGGER phase53_reject_summary BEFORE UPDATE ON campaign_sessions FOR EACH ROW EXECUTE FUNCTION phase53_reject_summary()`,
    );
    try {
      await http()
        .post(`${path}/finalize`)
        .send({ endingType: 'OBJECTIVE_COMPLETED' })
        .expect(500);
      expect((await http().get(path)).body.status).toBe('IN_PROGRESS');
      expect((await http().get(`${path}/summary`)).body.summary).toBeNull();
      expect((await http().get(`${path}/messages`)).body.data).toEqual(history);
      const second = `/api/v1/campaigns/${campaign.id}/sessions/${campaign.sessions[1]!.id}`;
      expect((await http().get(second)).body.status).toBe('LOCKED');
    } finally {
      await db.db.execute(
        sql`DROP TRIGGER phase53_reject_summary ON campaign_sessions`,
      );
      await db.db.execute(sql`DROP FUNCTION phase53_reject_summary()`);
    }
    for (let i = 0; i < 2; i++)
      await http()
        .post(`${path}/finalize`)
        .send({ endingType: 'OBJECTIVE_COMPLETED' })
        .expect(200);
    expect((await http().get(`${path}/messages`)).body.data).toEqual(history);
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
    const secondId = campaign.sessions[1]!.id;
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
  it.each(['NPC', 'FREE_PLAYER'] as const)(
    'keeps %s attack damage pending until Stunts resolve without repetition',
    async (role) => {
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
              sheet: npcSheet('Theron', role === 'NPC' ? 4 : 1),
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
          input: {
            commandId: randomUUID(),
            sessionId,
            action: 'EQUIP',
            itemId,
          },
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
            ? role === 'NPC'
              ? { kind: 'ATTACK', actorId: npcId, targetId: pc.id }
              : freeProposal(
                  'ATTACK',
                  { type: 'COMBAT', action: 'ATTACK' },
                  { type: 'CHARACTER', name: 'Theron' },
                )
            : null,
        narration: r.stage === 'NARRATE' ? r.confirmed : null,
        usage: [],
        error: null,
      }));
      const targetId = role === 'NPC' ? pc.id : npcId;
      const actorId = role === 'NPC' ? npcId : pc.id;
      const body =
        role === 'NPC'
          ? input()
          : {
              actionId: randomUUID(),
              interactionMode: 'ACT',
              content: 'Ataco Theron.',
            };
      const pending = (
        await http().post(`${path}/actions`).send(body).expect(201)
      ).body;
      expect(pending.status).toBe('AWAITING_STUNTS');
      expect(
        (await http().get(`/api/v1/characters/${targetId}`)).body.resources[0]
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
      const health = (await http().get(`/api/v1/characters/${targetId}`)).body
        .resources[0].current;
      expect(health).toBeLessThan(30);
      await http().post(`${path}/actions`).send(body).expect(201);
      expect(
        (await http().get(`/api/v1/characters/${targetId}`)).body.resources[0]
          .current,
      ).toBe(health);
      const attacks = await db.db.execute(
        sql`SELECT * FROM blue_rose_attacks WHERE actor_id = ${actorId}`,
      );
      expect(attacks.rows).toHaveLength(1);
    },
  );
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
    const second = `/api/v1/campaigns/${campaign.id}/sessions/${campaign.sessions[1]!.id}`;
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
