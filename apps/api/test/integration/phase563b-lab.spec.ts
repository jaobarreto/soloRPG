import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq } from 'drizzle-orm';
import {
  abilities,
  scenePlanSchema,
  type NarrativeBeat,
  type Narration,
} from '@solo-rpg/shared-contracts';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { DatabaseService } from '../../src/database/database.service';
import { GameEngineService } from '../../src/game-engine/game-engine.service';
import { AiServiceClient } from '../../src/integrations/ai-service/ai-service.client';
import { NarrativeContextService } from '../../src/narrative/context.service';
import {
  publicationChoices,
  validateRendering,
  type RenderingContext,
} from '../../src/narrative/rendering';
import { RANDOM_SOURCE } from '../../src/blue-rose/mechanics/dice/blue-rose-dice';
import * as g from '../../src/database/game-schema';
import * as n from '../../src/database/narrative-schema';
import { sessionMessages } from '../../src/database/schema';
import { dialogueSourceHash } from '../../src/narrative/dialogue-content';
import { legacyCampaign } from '../fixtures/legacy-campaign';

const specification = JSON.parse(
  readFileSync(resolve(__dirname, '../fixtures/narrative-lab.json'), 'utf8'),
);
type Selection = 'FIRST' | 'VARIED';
type LabRequest = {
  stage: string;
  context: Record<string, unknown>;
  confirmed: Narration | null;
};
type Step = {
  kind: string;
  text: string;
  expression: string;
  speaker?: string;
  nextSession?: boolean;
};
type Scenario = {
  id: string;
  name: string;
  personality: string;
  turns: Step[];
};
type Trace = {
  stage: string;
  category?: string;
  catalog: NarrativeBeat[];
  selected: NarrativeBeat[];
  facts: unknown[];
  speaker: unknown;
  requestCharacters: number;
  preparedReplies: unknown[];
};

// Evaluation instrumentation only. All external AI is replaced at the client seam.
describe('TEST-VOICE-002/003/005/010/011/012/013 563B multi-turn production narrative laboratory (offline)', () => {
  let app: INestApplication, db: DatabaseService, engine: GameEngineService;
  let proposal: object,
    selector: Selection = 'FIRST',
    turnIndex = 0,
    attack = false;
  let traces: Trace[] = [];
  const runs: object[] = [];
  const directedControls: object[] = [];
  let beforePublish: (() => Promise<void>) | null = null;
  let controlsValidated = false;
  const bridge = jest.fn(async (input: LabRequest) => {
    const rendering = input.context.rendering as RenderingContext | undefined;
    let payload: object = proposal;
    let selected: NarrativeBeat[] = [];
    const catalog = rendering?.publication?.choices ?? [];
    if (input.stage === 'NARRATE') {
      payload = input.confirmed!;
      if (rendering && ['DIALOGUE', 'MECHANIC'].includes(rendering.category)) {
        if (rendering.category === 'DIALOGUE') {
          const prepared = rendering.dialogue?.replies ?? [];
          const plain = prepared.length
            ? prepared.map((r) => r.beat)
            : catalog.filter((b) => b.kind === 'DIALOGUE' && !b.factIds.length);
          selected = [
            plain[selector === 'FIRST' ? 0 : turnIndex % plain.length]!,
          ];
          const memory = catalog.find(
            (b) => b.kind === 'DIALOGUE' && b.text.includes('MEMORIA_ANTERIOR'),
          );
          if (selector === 'VARIED' && memory && !rendering.dialogue?.selection)
            selected.push(memory);
        } else selected = [catalog.find((b) => b.kind === 'RESULT')!];
        const atmosphere = catalog.find((b) => b.kind === 'ATMOSPHERE');
        if (atmosphere) selected.push(atmosphere);
        const questions = catalog.filter((b) => b.kind === 'QUESTION');
        selected.push(
          questions[selector === 'FIRST' ? 0 : turnIndex % questions.length]!,
        );
        if (attack)
          selected.push({
            kind: 'ATMOSPHERE',
            speakerId: null,
            factIds: [],
            text: 'Atrás da estante há uma galeria que conduz ao jardim.',
          });
        payload = {
          ...input.confirmed,
          narrative: selected.map((b) => b.text).join('\n\n'),
          beats: selected,
        };
      }
    }
    traces.push({
      stage: input.stage,
      category: rendering?.category,
      catalog,
      selected,
      facts: rendering?.facts ?? [],
      speaker: rendering?.speaker ?? null,
      requestCharacters: JSON.stringify(input).length,
      preparedReplies: rendering?.dialogue?.replies ?? [],
    });
    const child = spawnSync(
      resolve(__dirname, '../../../ai-service/.venv/bin/python'),
      ['-m', 'app.evaluation.replay'],
      {
        cwd: resolve(__dirname, '../../../ai-service'),
        input: JSON.stringify({ request: input, proposal: payload }),
        encoding: 'utf8',
        timeout: 15000,
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    if (child.status !== 0)
      throw new Error('Offline Python production graph failed');
    const output = JSON.parse(child.stdout);
    if (input.stage === 'NARRATE' && beforePublish) {
      const change = beforePublish;
      beforePublish = null;
      await change();
    }
    return output;
  });
  const http = () => request(app.getHttpServer());
  beforeAll(async () => {
    if (
      !process.env.INTEGRATION_CONTAINER?.startsWith('solorpg-test-') ||
      !process.env.INTEGRATION_DATABASE_URL?.includes('/solorpg_test')
    )
      throw new Error('Disposable test DB required');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AiServiceClient)
      .useValue({ turn: bridge })
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
    writeFileSync(
      '/tmp/khaos563b-lab.json',
      JSON.stringify(
        {
          phase: '5.6.3B',
          evidenceKind:
            'SCRIPTED_PRODUCTION_GRAPH_HTTP_AND_DISPOSABLE_POSTGRES',
          realProviderRequests: 0,
          selectorPolicies: ['FIRST', 'VARIED'],
          complete:
            runs.length === 12 &&
            controlsValidated &&
            directedControls.length === 5,
          eliminatoryControlsValidated: controlsValidated,
          runs,
          directedControls,
        },
        null,
        2,
      ) + '\n',
    );
    await app?.close();
  });
  const local = (c: string, command: unknown, s?: string) =>
    engine.executeInternal({
      campaignId: c,
      ...(s ? { sessionId: s } : {}),
      commandId: randomUUID(),
      command,
    });
  async function setup(scenario: Scenario, allPresent = false) {
    const campaign = await legacyCampaign(
      app,
      2,
      'Laboratório sintético 5.6.3A',
    );
    const c = campaign.id,
      sessions = campaign.sessions.map((s) => s.id);
    const actor = async (
      name: string,
      kind: 'PROTAGONIST' | 'COMPANION',
      personality = '',
    ) =>
      (
        await local(c, {
          type: 'CHARACTER_CREATE',
          kind,
          known: true,
          personality,
          motivations: 'Escutar sem oferecer confiança automática.',
          privateNotes: 'SEGREDO_PRIVADO_DO_CARD',
          sheet: {
            commandId: randomUUID(),
            name,
            people: 'Human',
            background: 'Fixture sintética',
            characterClass: 'ADEPT',
            level: 1,
            maxHealth: 30,
            abilities: Object.fromEntries(abilities.map((a) => [a, 2])),
          },
        })
      ).id;
    const pc = await actor('Naelis', 'PROTAGONIST');
    const iria = await actor('Iria', 'COMPANION', scenario.personality);
    const tessa = await actor(
      'Tessa',
      'COMPANION',
      'Cautelosa e reservada, humor seco',
    );
    const shelf = randomUUID(),
      option = randomUUID();
    await local(c, {
      type: 'WORLD_UPSERT',
      entityId: shelf,
      kind: 'OBJECT',
      name: 'Estante',
      description: 'Uma estante de madeira com lombadas gastas.',
      status: 'INTACT',
      accessible: true,
      visibility: 'PUBLIC',
      privateNotes: 'SEGREDO_DO_MESTRE: não há passagem atrás da estante.',
      reason: 'Preparação sintética sem passagem secreta.',
    });
    for (const [index, s] of sessions.entries())
      await local(c, {
        type: 'SCENE_CONFIGURE',
        targetSessionId: s,
        plan: scenePlanSchema.parse({
          opening: specification.opening,
          presentCharacterIds:
            index === 0 && !allPresent ? [pc, iria] : [pc, iria, tessa],
          options: [
            {
              id: index === 0 ? option : randomUUID(),
              intent: 'Examinar a estante',
              mode: 'ACT',
              targetEntityId: shelf,
              keywords: ['examinar'],
              check: {
                ability: 'PERCEPTION',
                focusId: null,
                targetNumber: 30,
                secret: false,
              },
              successText: 'O selo da lombada foi identificado como azul.',
              failureText: 'A busca não identificou nenhuma abertura.',
              witnesses: [iria],
              effects: [],
            },
          ],
          objectives: [],
        }),
      });
    await http()
      .post(`/api/v1/campaigns/${c}/sessions/${sessions[0]}/start`)
      .send({})
      .expect(200);
    const addFact = async (characterId: string, description: string) => {
      const event = await local(
        c,
        {
          type: 'EVENT_RECORD',
          eventType: 'CONSEQUENCE_RECORDED',
          description,
          participants: [characterId],
          visibility: 'PUBLIC',
        },
        sessions[0],
      );
      await db.db.insert(n.characterKnowledge).values({
        campaignId: c,
        characterId,
        eventId: event.id,
        source: 'WITNESSED',
        importance: 90,
      });
      return event.id;
    };
    await addFact(
      pc,
      'SEGREDO_SO_DA_NAELIS: identidade privada da testemunha.',
    );
    const disagreementText =
      'MEMORIA_ANTERIOR: Iria e Naelis discordaram sobre a decisão de continuar a viagem; o desacordo não foi resolvido.';
    const disagreement = ['563A-02', '563A-05'].includes(scenario.id)
      ? await addFact(iria, disagreementText)
      : null;
    // Explicit synthetic preparation, not a state extracted from generated prose.
    for (const id of [iria, tessa])
      await db.db
        .update(g.characters)
        .set({ state: 'UNRESOLVED' })
        .where(eq(g.characters.id, id));
    for (const sessionId of sessions) {
      const [stored] = await db.db
        .select()
        .from(n.sessionPlans)
        .where(eq(n.sessionPlans.sessionId, sessionId));
      const plan = scenePlanSchema.parse(stored!.plan);
      plan.dialogue = [iria, tessa].map((id) => ({
        libraryId: 'khaos-dialogue' as const,
        contentVersion: 1 as const,
        characterId: id,
        voiceId:
          id === iria && scenario.personality.includes('Gentil')
            ? ('WARM' as const)
            : ('RESERVED' as const),
        expectedState: 'UNRESOLVED',
        topics: ['conversation', 'disagreement', 'surroundings', 'promise'],
        sources: [
          {
            key: 'surroundings',
            kind: 'PUBLIC',
            referenceId: shelf,
            descriptionHash: dialogueSourceHash(
              'Uma estante de madeira com lombadas gastas.',
            ),
          },
          ...(disagreement
            ? [
                {
                  key: 'disagreement' as const,
                  kind: 'KNOWLEDGE' as const,
                  referenceId: disagreement,
                  descriptionHash: dialogueSourceHash(disagreementText),
                },
              ]
            : []),
        ],
        provenance: {
          authorId: 'synthetic-lab',
          source: 'fixture:phase563b',
          reviewed: true as const,
        },
      }));
      await db.db
        .update(n.sessionPlans)
        .set({ plan })
        .where(eq(n.sessionPlans.sessionId, sessionId));
    }
    return { c, pc, iria, tessa, shelf, option, sessions, disagreement };
  }
  async function state(c: string, pc: string, s: string) {
    return {
      world: await db.db
        .select()
        .from(g.worldEntities)
        .where(eq(g.worldEntities.campaignId, c)),
      relations: await db.db
        .select()
        .from(g.relationships)
        .where(eq(g.relationships.campaignId, c)),
      health: await db.db
        .select()
        .from(g.characterResources)
        .where(eq(g.characterResources.characterId, pc)),
      inventory: await db.db
        .select()
        .from(g.inventory)
        .where(eq(g.inventory.characterId, pc)),
      rolls: await db.db
        .select()
        .from(g.diceRolls)
        .where(eq(g.diceRolls.campaignId, c)),
      events: await db.db
        .select()
        .from(g.gameEvents)
        .where(eq(g.gameEvents.campaignId, c)),
      progress: await app.get(NarrativeContextService).progress(c, s),
    };
  }
  const dialogueRequests: Record<string, [string, string][]> = {
    '563A-01': [
      ['conversation', 'ANSWER'],
      ['conversation', 'UNKNOWN'],
      ['conversation', 'CLARIFY'],
      ['conversation', 'RESUME'],
      ['conversation', 'CLARIFY'],
    ],
    '563A-02': [
      ['disagreement', 'RESUME'],
      ['disagreement', 'DISAGREE'],
      ['disagreement', 'ANSWER'],
      ['disagreement', 'REFUSE'],
    ],
    '563A-04': [
      ['conversation', 'CAUTION'],
      ['conversation', 'UNKNOWN'],
      ['conversation', 'DOUBT'],
      ['conversation', 'UNKNOWN'],
      ['conversation', 'ANSWER'],
    ],
    '563A-05': [
      ['disagreement', 'RESUME'],
      ['disagreement', 'ANSWER'],
      ['conversation', 'UNKNOWN'],
      ['disagreement', 'ANSWER'],
      ['disagreement', 'RESUME'],
    ],
    '563A-06': [
      ['conversation', 'CAUTION'],
      ['conversation', 'UNKNOWN'],
      ['conversation', 'RESUME'],
      ['conversation', 'UNKNOWN'],
      ['conversation', 'ANSWER'],
    ],
  };
  for (const scenario of specification.scenarios as Scenario[])
    for (const policy of ['FIRST', 'VARIED'] as const) {
      it(`${scenario.id}/${policy}: ${scenario.name}`, async () => {
        selector = policy;
        const ctx = await setup(scenario);
        let s = ctx.sessions[0]!;
        const transcript: object[] = [];
        let sessionTransition: object | null = null;
        for (const [index, step] of scenario.turns.entries()) {
          turnIndex = index;
          attack = false;
          traces = [];
          if (step.nextSession) {
            const previous = (
              await http()
                .get(`/api/v1/campaigns/${ctx.c}/sessions/${s}/messages`)
                .expect(200)
            ).body.data;
            await http()
              .post(`/api/v1/campaigns/${ctx.c}/sessions/${s}/finalize`)
              .send({ endingType: 'PLAYER_REQUESTED' })
              .expect(200);
            s = ctx.sessions[1]!;
            await http()
              .post(`/api/v1/campaigns/${ctx.c}/sessions/${s}/start`)
              .send({})
              .expect(200);
            expect(
              (
                await http()
                  .get(
                    `/api/v1/campaigns/${ctx.c}/sessions/${ctx.sessions[0]}/messages`,
                  )
                  .expect(200)
              ).body.data,
            ).toEqual(previous);
            sessionTransition = {
              via: 'LEGACY_SYNTHETIC_FINALIZE',
              oldChatPreserved: true,
            };
          }
          const path = `/api/v1/campaigns/${ctx.c}/sessions/${s}`;
          const snapshot = await app
            .get(NarrativeContextService)
            .build(ctx.c, s);
          const source = snapshot.selection.information.find((i) =>
            step.kind === 'ooc'
              ? i.scope === 'RULES'
              : i.scope === 'PUBLIC' && i.target?.name === 'Estante',
          );
          const dialogue = step.kind === 'dialogue',
            check = step.kind.startsWith('check');
          proposal = {
            kind: 'FREE',
            intent: dialogue
              ? 'TALK'
              : step.kind === 'ooc'
                ? 'OOC'
                : step.kind === 'observe'
                  ? 'OBSERVE'
                  : 'INVESTIGATE',
            expression: step.expression,
            description: 'Proposta roteirizada do laboratório.',
            target: dialogue
              ? { type: 'CHARACTER', name: step.speaker ?? 'Iria' }
              : step.kind === 'ooc'
                ? null
                : { type: 'WORLD', name: 'Estante' },
            evidence:
              step.kind === 'observe' || step.kind === 'ooc'
                ? [source!.key]
                : [],
            tool: dialogue
              ? {
                  type: 'DIALOGUE',
                  topic: dialogueRequests[scenario.id]![index]![0],
                  act: dialogueRequests[scenario.id]![index]![1],
                }
              : step.kind === 'ooc'
                ? { type: 'QUERY', subject: 'RULES' }
                : step.kind === 'observe'
                  ? { type: 'OBSERVE' }
                  : check
                    ? {
                        type: 'PREPARED_CHECK',
                        capability: 'Examinar a estante',
                      }
                    : { type: 'ADJUDICATE' },
          };
          if (check) {
            const [prepared] = await db.db
              .select()
              .from(n.sessionPlans)
              .where(eq(n.sessionPlans.sessionId, s));
            const plan = scenePlanSchema.parse(prepared!.plan);
            plan.options[0]!.check!.targetNumber =
              step.kind === 'check-success' ? 10 : 30;
            await db.db
              .update(n.sessionPlans)
              .set({ plan })
              .where(eq(n.sessionPlans.sessionId, s));
          }
          const before = await state(ctx.c, ctx.pc, s);
          const body = {
            actionId: randomUUID(),
            interactionMode: dialogue
              ? 'SPEAK'
              : step.kind === 'ooc'
                ? 'OUT_OF_CHARACTER'
                : 'ACT',
            content: step.text,
          };
          let response = await http()
            .post(`${path}/actions`)
            .send(body)
            .expect(201);
          if (check) {
            expect(response.body.status).toBe('AWAITING_ROLL');
            attack = scenario.id === '563A-03';
            response = await http()
              .post(`${path}/actions/${body.actionId}/roll`)
              .send({})
              .expect(200);
          }
          expect(response.body.status).toBe('COMPLETED');
          const [action] = await db.db
            .select()
            .from(n.narrativeActions)
            .where(eq(n.narrativeActions.id, body.actionId));
          const [message] = await db.db
            .select()
            .from(sessionMessages)
            .where(eq(sessionMessages.id, action!.masterMessageId!));
          const after = await state(ctx.c, ctx.pc, s);
          expect(after.world).toEqual(before.world);
          expect(after.relations).toEqual(before.relations);
          expect(after.health).toEqual(before.health);
          expect(after.inventory).toEqual(before.inventory);
          if (!check) expect(after.rolls).toEqual(before.rolls);
          if (!dialogue && !check) expect(after.events).toEqual(before.events);
          expect(after.progress).toEqual(before.progress);
          expect(message!.content).not.toMatch(/SEGREDO_|há uma galeria/);
          if (step.kind === 'check-failure')
            expect(message!.content).toContain(
              'A busca não identificou nenhuma abertura.',
            );
          if (step.kind === 'check-success')
            expect(message!.content).toContain(
              'O selo da lombada foi identificado como azul.',
            );
          const narration = traces.find((t) => t.stage === 'NARRATE');
          // The protagonist may receive her own knowledge on OBSERVE. It must
          // never become another speaker's knowledge or public catalog text.
          if (narration?.speaker)
            expect(JSON.stringify(narration)).not.toContain('SEGREDO_');
          expect(JSON.stringify(narration?.catalog)).not.toContain('SEGREDO_');
          if (step.speaker === 'Tessa')
            expect(JSON.stringify(narration?.catalog)).not.toContain(
              'MEMORIA_ANTERIOR',
            );
          if (
            scenario.id === '563A-05' &&
            s === ctx.sessions[1] &&
            !step.speaker
          )
            expect(JSON.stringify(narration?.catalog)).toContain(
              ctx.disagreement!,
            );
          if (attack) {
            expect(message!.metadata?.deterministicFallback).toBe(true);
            expect(message!.metadata?.renderingValidation).toBe(
              'UNAPPROVED_SEGMENT',
            );
          }
          transcript.push({
            id: `${scenario.id.replace('563A', '563B')}-${policy}-t${index + 1}`,
            session: index < 2 || scenario.id !== '563A-05' ? 1 : 2,
            step,
            publicText: message!.content,
            metadata: message!.metadata,
            confirmed: action!.confirmed,
            trace: traces,
            stateChecks: {
              worldUnchanged: true,
              relationshipsUnchanged: true,
              healthUnchanged: true,
              progressUnchanged: true,
              noUnauthorizedRoll: !check,
              officialCheck: check,
              privateInformationExcluded: true,
            },
            canonicalViolations: [],
          });
        }
        expect(
          (
            await http()
              .get(`/api/v1/campaigns/${ctx.c}/sessions/${s}`)
              .expect(200)
          ).body.status,
        ).toBe('IN_PROGRESS');
        runs.push({
          scenarioId: scenario.id,
          name: scenario.name,
          selector: policy,
          turns: transcript,
          sessionTransition,
          canonicalGate: 'PASS_FOR_ASSERTED_INVARIANTS',
          coverageBoundary:
            'Synthetic characters and legacy session lifecycle; Gloamhale cards and new Director audited separately, not simulated as certified here.',
        });
      }, 120000);
    }
  const contextualProposal = (name: string, topic: string, act: string) => ({
    kind: 'FREE',
    intent: 'TALK',
    expression: 'QUESTION',
    evidence: [],
    description: 'Conversa preparada',
    target: { type: 'CHARACTER', name },
    tool: { type: 'DIALOGUE', topic, act },
  });
  const converse = async (
    ctx: Awaited<ReturnType<typeof setup>>,
    name = 'Iria',
    topic = 'disagreement',
    act = 'ANSWER',
  ) => {
    proposal = contextualProposal(name, topic, act);
    selector = 'FIRST';
    turnIndex = 0;
    attack = false;
    traces = [];
    const body = {
      actionId: randomUUID(),
      interactionMode: 'SPEAK',
      content: `${name}, o que pensa desse assunto?`,
    };
    const path = `/api/v1/campaigns/${ctx.c}/sessions/${ctx.sessions[0]}`;
    const result = await http().post(`${path}/actions`).send(body).expect(201);
    expect(result.body.status).toBe('COMPLETED');
    const [row] = await db.db
      .select()
      .from(n.narrativeActions)
      .where(eq(n.narrativeActions.id, body.actionId));
    const [message] = await db.db
      .select()
      .from(sessionMessages)
      .where(eq(sessionMessages.id, row!.masterMessageId!));
    return { path, body, message: message! };
  };

  it('TEST-VOICE-001 two explicitly prepared NPCs answer the same subject in distinct voices', async () => {
    const ctx = await setup(specification.scenarios[1], true);
    await db.db
      .update(g.characters)
      .set({
        personality: 'Acolhedora e expressiva',
        motivations: 'Oferecer esclarecimentos sem prometer ajuda.',
      })
      .where(eq(g.characters.id, ctx.tessa));
    const tessaDisagreement =
      'Tessa e Naelis discordaram sobre como continuar a viagem; o desacordo não foi resolvido.';
    const ownEvent = await local(
      ctx.c,
      {
        type: 'EVENT_RECORD',
        eventType: 'CONSEQUENCE_RECORDED',
        description: tessaDisagreement,
        participants: [ctx.tessa, ctx.pc],
        visibility: 'PUBLIC',
      },
      ctx.sessions[0],
    );
    await db.db.insert(n.characterKnowledge).values({
      campaignId: ctx.c,
      characterId: ctx.tessa,
      eventId: ownEvent.id,
      source: 'WITNESSED',
      importance: 90,
    });
    const [stored] = await db.db
      .select()
      .from(n.sessionPlans)
      .where(eq(n.sessionPlans.sessionId, ctx.sessions[0]!));
    const plan = scenePlanSchema.parse(stored!.plan);
    const tessaBinding = plan.dialogue!.find(
      (b) => b.characterId === ctx.tessa,
    )!;
    tessaBinding.voiceId = 'WARM';
    tessaBinding.sources = [
      {
        key: 'disagreement',
        kind: 'KNOWLEDGE',
        referenceId: ownEvent.id,
        descriptionHash: dialogueSourceHash(tessaDisagreement),
      },
    ];
    await db.db
      .update(n.sessionPlans)
      .set({ plan })
      .where(eq(n.sessionPlans.sessionId, ctx.sessions[0]!));
    const cautious = await converse(ctx);
    const warm = await converse(ctx, 'Tessa');
    expect(cautious.message.content).toContain(
      'Não considero aquele desacordo resolvido',
    );
    expect(warm.message.content).toContain('Quero falar disso com clareza');
    expect(cautious.message.content.replaceAll('Iria', 'NPC')).not.toBe(
      warm.message.content.replaceAll('Tessa', 'NPC'),
    );
    const published = (await http().get(`${warm.path}/messages`).expect(200))
      .body.data;
    expect(
      published.find((m: { id: string }) => m.id === warm.message.id).metadata,
    ).not.toHaveProperty('dialogueProvenance');
    expect(warm.message.metadata?.dialogueProvenance).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ contentVersion: 1, voiceId: 'WARM' }),
      ]),
    );
    directedControls.push({
      id: 'TEST-VOICE-001',
      publicTexts: [cautious.message.content, warm.message.content],
      provenance: [
        cautious.message.metadata?.dialogueProvenance,
        warm.message.metadata?.dialogueProvenance,
      ],
    });
  });

  it("TEST-VOICE-004/007/008 unknown topic and someone else's knowledge stay unavailable", async () => {
    const ctx = await setup(specification.scenarios[1], true);
    const before = await state(ctx.c, ctx.pc, ctx.sessions[0]!);
    const unknown = await converse(ctx, 'Iria', 'secret-future', 'ANSWER');
    expect(unknown.message.content).toContain('Não há uma resposta autorizada');
    const unowned = await converse(ctx, 'Tessa');
    expect(unowned.message.content).toContain('Não há uma resposta autorizada');
    await db.db.insert(n.characterKnowledge).values({
      campaignId: ctx.c,
      characterId: ctx.tessa,
      eventId: ctx.disagreement!,
      source: 'WITNESSED',
      importance: 90,
    });
    const witnessOnly = await converse(ctx, 'Tessa');
    expect(witnessOnly.message.content).toContain(
      'Não há uma resposta autorizada',
    );
    const after = await state(ctx.c, ctx.pc, ctx.sessions[0]!);
    expect(after.events).toEqual(before.events);
    expect(after.world).toEqual(before.world);
    directedControls.push({
      id: 'TEST-VOICE-004/007/008',
      publicTexts: [
        unknown.message.content,
        unowned.message.content,
        witnessOnly.message.content,
      ],
      eventsAndWorldUnchanged: true,
    });
  });

  it('TEST-VOICE-006 a recorded promise is HEARD speech, never automatic help', async () => {
    const ctx = await setup(specification.scenarios[1], true);
    const description = 'Iria disse: pretendo ajudar quando puder.';
    const event = await local(
      ctx.c,
      {
        type: 'EVENT_RECORD',
        eventType: 'SPEECH_RECORDED',
        description,
        participants: [ctx.iria, ctx.pc],
        visibility: 'PUBLIC',
      },
      ctx.sessions[0],
    );
    await db.db.insert(n.characterKnowledge).values({
      campaignId: ctx.c,
      characterId: ctx.iria,
      eventId: event.id,
      source: 'HEARD',
      importance: 90,
    });
    const [stored] = await db.db
      .select()
      .from(n.sessionPlans)
      .where(eq(n.sessionPlans.sessionId, ctx.sessions[0]!));
    const plan = scenePlanSchema.parse(stored!.plan);
    plan.dialogue![0]!.sources.push({
      key: 'promise',
      kind: 'KNOWLEDGE',
      referenceId: event.id,
      descriptionHash: dialogueSourceHash(description),
    });
    await db.db
      .update(n.sessionPlans)
      .set({ plan })
      .where(eq(n.sessionPlans.sessionId, ctx.sessions[0]!));
    const before = await state(ctx.c, ctx.pc, ctx.sessions[0]!);
    const response = await converse(ctx, 'Iria', 'promise', 'ANSWER');
    expect(response.message.content).toContain('não um resultado confirmado');
    expect(response.message.content).toContain(`> ${description}`);
    const after = await state(ctx.c, ctx.pc, ctx.sessions[0]!);
    expect(after.world).toEqual(before.world);
    expect(after.relations).toEqual(before.relations);
    expect(after.health).toEqual(before.health);
    expect(after.inventory).toEqual(before.inventory);
    const reply = after.events
      .filter((e) => e.type === 'NPC_REPLY_RECORDED')
      .at(-1)!;
    expect(reply.description).toContain('fala atribuída, não verdade do mundo');
    const knowledge = await db.db
      .select()
      .from(n.characterKnowledge)
      .where(eq(n.characterKnowledge.eventId, reply.id));
    expect(knowledge.every((k) => k.source === 'HEARD')).toBe(true);
    directedControls.push({
      id: 'TEST-VOICE-006',
      sourceDescription: description,
      publicTexts: [response.message.content],
      provenance: response.message.metadata?.dialogueProvenance,
      heardSpeechOnly: true,
      worldRelationsHealthInventoryUnchanged: true,
    });
  });

  it('TEST-VOICE-009/014 state changes during generation revoke the prepared fragment transactionally', async () => {
    const ctx = await setup(specification.scenarios[1], true);
    beforePublish = async () => {
      await db.db
        .update(g.characters)
        .set({ state: 'RESOLVED_BY_OPERATOR' })
        .where(eq(g.characters.id, ctx.iria));
    };
    const response = await converse(ctx);
    expect(response.message.metadata?.deterministicFallback).toBe(true);
    expect(response.message.metadata?.renderingValidation).toBe(
      'UNAPPROVED_SEGMENT',
    );
    expect(response.message.content).not.toContain(
      'Não considero aquele desacordo resolvido',
    );
    expect(response.message.metadata?.dialogueProvenance).toEqual([]);
    const snapshot = await app
      .get(NarrativeContextService)
      .build(ctx.c, ctx.sessions[0]!);
    expect(
      snapshot.dialogue?.find((d) => d.characterId === ctx.iria),
    ).toBeUndefined();
    const replies = await db.db
      .select()
      .from(g.gameEvents)
      .where(eq(g.gameEvents.campaignId, ctx.c));
    expect(
      replies.filter((e) => e.type === 'NPC_REPLY_RECORDED').at(-1)!
        .description,
    ).not.toContain('Não considero aquele desacordo resolvido');
    directedControls.push({
      id: 'TEST-VOICE-009/014',
      publicTexts: [response.message.content],
      metadata: response.message.metadata,
      rejectedFragmentNotRemembered: true,
    });
  });

  it('TEST-VOICE-015 historic content stays readable and repetition is idempotent', async () => {
    const ctx = await setup(specification.scenarios[1], true);
    const response = await converse(ctx);
    const before = (await http().get(`${response.path}/messages`).expect(200))
      .body.data;
    const stateBefore = await state(ctx.c, ctx.pc, ctx.sessions[0]!);
    const calls = bridge.mock.calls.length;
    await http()
      .post(`${response.path}/actions`)
      .send(response.body)
      .expect(201);
    expect(bridge.mock.calls.length).toBe(calls);
    expect(
      (await http().get(`${response.path}/messages`).expect(200)).body.data,
    ).toEqual(before);
    expect((await state(ctx.c, ctx.pc, ctx.sessions[0]!)).events).toEqual(
      stateBefore.events,
    );
    const [old] = await db.db
      .select()
      .from(sessionMessages)
      .where(eq(sessionMessages.id, response.message.id));
    expect(old!.content).toBe(response.message.content);
    directedControls.push({
      id: 'TEST-VOICE-015',
      publicTexts: [old!.content],
      unchangedHistoryEventsAndProviderCallCount: true,
    });
  });

  it('TEST-VOICE-011/013 legacy scope and adversarial publication controls remain intact', () => {
    const confirmed = { narrative: 'O teste falhou.', eventIds: [] };
    const context: RenderingContext = {
      category: 'DIALOGUE',
      protagonist: null,
      speaker: {
        id: randomUUID(),
        name: 'Iria',
        personality: 'Cautelosa',
        speech: 'Fala em versos curtos.',
        motivations: 'Viajar',
        state: 'Ainda zangada',
      },
      scene: null,
      facts: [],
      rules: [],
    };
    const baseline = publicationChoices(context, confirmed);
    expect(
      publicationChoices(
        {
          ...context,
          speaker: {
            ...context.speaker!,
            speech: 'Usa humor seco.',
            motivations: 'Ficar',
            state: 'Indiferente',
          },
        },
        confirmed,
      ),
    ).toEqual(baseline);
    for (const text of [
      'Uma passagem apareceu atrás da estante.',
      'O teste foi bem-sucedido.',
      'SEGREDO_DO_MESTRE',
      'Naelis concorda e diz: aceito.',
      'Iria perdoou Naelis; a confiança aumentou.',
      'A aventura agora confirma uma sala antes inexistente.',
    ]) {
      const beat = {
        kind: 'DIALOGUE' as const,
        text,
        speakerId: context.speaker!.id,
        factIds: [],
      };
      expect(
        validateRendering(
          { narrative: text, eventIds: [], beats: [beat] },
          confirmed,
          context,
        ).accepted,
      ).toBe(false);
    }
    controlsValidated = true;
  });
});
