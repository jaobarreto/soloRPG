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
};

// Evaluation instrumentation only. All external AI is replaced at the client seam.
describe('TEST-LIT563A multi-turn production narrative laboratory (offline)', () => {
  let app: INestApplication, db: DatabaseService, engine: GameEngineService;
  let proposal: object,
    selector: Selection = 'FIRST',
    turnIndex = 0,
    attack = false;
  let traces: Trace[] = [];
  const runs: object[] = [];
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
          const plain = catalog.filter(
            (b) => b.kind === 'DIALOGUE' && !b.factIds.length,
          );
          selected = [
            plain[selector === 'FIRST' ? 0 : turnIndex % plain.length]!,
          ];
          const memory = catalog.find(
            (b) => b.kind === 'DIALOGUE' && b.text.includes('MEMORIA_ANTERIOR'),
          );
          if (selector === 'VARIED' && memory) selected.push(memory);
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
    return JSON.parse(child.stdout);
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
      '/tmp/khaos563a-lab.json',
      JSON.stringify(
        {
          phase: '5.6.3A',
          evidenceKind:
            'SCRIPTED_PRODUCTION_GRAPH_HTTP_AND_DISPOSABLE_POSTGRES',
          realProviderRequests: 0,
          selectorPolicies: ['FIRST', 'VARIED'],
          complete: runs.length === 12 && controlsValidated,
          eliminatoryControlsValidated: controlsValidated,
          runs,
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
  async function setup(scenario: Scenario) {
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
          presentCharacterIds: index === 0 ? [pc, iria] : [pc, iria, tessa],
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
    };
    await addFact(
      pc,
      'SEGREDO_SO_DA_NAELIS: identidade privada da testemunha.',
    );
    if (['563A-02', '563A-05'].includes(scenario.id))
      await addFact(
        iria,
        'MEMORIA_ANTERIOR: Iria e Naelis discordaram sobre a decisão de continuar a viagem; o desacordo não foi resolvido.',
      );
    return { c, pc, iria, tessa, shelf, option, sessions };
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
              ? { type: 'DIALOGUE' }
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
              'MEMORIA_ANTERIOR',
            );
          if (attack) {
            expect(message!.metadata?.deterministicFallback).toBe(true);
            expect(message!.metadata?.renderingValidation).toBe(
              'UNAPPROVED_SEGMENT',
            );
          }
          transcript.push({
            id: `${scenario.id}-${policy}-t${index + 1}`,
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
  it('TEST-LIT563A scope controls: profile specificity is unused, and unapproved agency/state/facts remain blocked', () => {
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
