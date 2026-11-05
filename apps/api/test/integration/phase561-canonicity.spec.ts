import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq, sql } from 'drizzle-orm';
import {
  abilities,
  scenePlanSchema,
  type Narration,
} from '@solo-rpg/shared-contracts';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { DatabaseService } from '../../src/database/database.service';
import { GameEngineService } from '../../src/game-engine/game-engine.service';
import { AiServiceClient } from '../../src/integrations/ai-service/ai-service.client';
import { NarrativeContextService } from '../../src/narrative/context.service';
import type { RenderingContext } from '../../src/narrative/rendering';
import { RANDOM_SOURCE } from '../../src/blue-rose/mechanics/dice/blue-rose-dice';
import * as g from '../../src/database/game-schema';
import { sessionMessages } from '../../src/database/schema';
import * as n from '../../src/database/narrative-schema';
import { legacyCampaign } from '../fixtures/legacy-campaign';

// Security regression: the paraphrase test must remain red until a canonical
// publication boundary exists. Do not turn its rejection assertion into success.
describe('TEST-AI561-CANON authoritative fixtures → Python graph → public history', () => {
  let app: INestApplication, db: DatabaseService, engine: GameEngineService;
  let proposal: object;
  let addedText: string | null = null;
  const rows: object[] = [];
  let renderOutput:
    | ((input: {
        context: { rendering?: RenderingContext };
        confirmed?: Narration | null;
      }) => Narration)
    | null = null;
  let failNarration = false;
  const turn = jest.fn(
    async (input: {
      stage: string;
      context: { rendering?: RenderingContext };
      confirmed?: Narration | null;
    }) => {
      let payload = proposal;
      if (input.stage === 'NARRATE' && failNarration) {
        failNarration = false;
        throw new Error('Synthetic generation failure');
      }
      if (input.stage === 'NARRATE' && input.confirmed) {
        payload = input.confirmed;
        if (addedText && input.context.rendering?.category === 'MECHANIC') {
          const beats = [
            {
              kind: 'RESULT',
              speakerId: null,
              text: input.confirmed.narrative,
              factIds: [],
            },
            {
              kind: 'ATMOSPHERE',
              speakerId: null,
              text: addedText,
              factIds: [],
            },
          ];
          payload = {
            ...input.confirmed,
            narrative: beats.map((b) => b.text).join('\n\n'),
            beats,
          };
        }
      }
      if (input.stage === 'NARRATE' && renderOutput)
        payload = renderOutput(input);
      // This bridge imports no Gemini SDK and never creates a real provider.
      const child = spawnSync(
        resolve(__dirname, '../../../ai-service/.venv/bin/python'),
        ['-m', 'app.evaluation.replay'],
        {
          cwd: resolve(__dirname, '../../../ai-service'),
          encoding: 'utf8',
          input: JSON.stringify({ request: input, proposal: payload }),
          timeout: 15000,
        },
      );
      if (child.status !== 0)
        throw new Error('Offline production graph bridge failed');
      return JSON.parse(child.stdout);
    },
  );
  const http = () => request(app.getHttpServer());
  beforeAll(async () => {
    // Refuse to run against developer configuration or a real campaign DB.
    if (
      !process.env.INTEGRATION_CONTAINER?.startsWith('solorpg-test-') ||
      !process.env.INTEGRATION_DATABASE_URL?.includes('/solorpg_test')
    )
      throw new Error('Unique disposable integration database required');
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
    writeFileSync(
      '/tmp/khaos562-canonicity-audit.json',
      JSON.stringify(
        {
          evidenceKind: 'SCRIPTED_PRODUCTION_GRAPH_AND_DISPOSABLE_DATABASE',
          realGeminiCalls: 0,
          productionChanges: true,
          rows,
        },
        null,
        2,
      ),
    );
    await app?.close();
  });

  async function setup(
    canon: 'ABSENT' | 'HIDDEN' | 'UNSPECIFIED',
    tn = 30,
    withNpc = false,
    opening = 'Uma biblioteca com uma estante de madeira.',
  ) {
    addedText = null;
    renderOutput = null;
    failNarration = false;
    const campaign = await legacyCampaign(
      app,
      2,
      'Fixture de canonicidade 5.6.1',
    );
    const c = campaign.id,
      s = campaign.sessions[0]!.id;
    const local = (command: unknown) =>
      engine.executeInternal({
        campaignId: c,
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
    const npc = withNpc
      ? (
          await local({
            type: 'CHARACTER_CREATE',
            kind: 'COMPANION',
            known: true,
            sheet: {
              commandId: randomUUID(),
              name: 'Mira',
              people: 'Human',
              background: 'Fixture',
              characterClass: 'EXPERT',
              level: 1,
              maxHealth: 30,
              abilities: Object.fromEntries(abilities.map((a) => [a, 2])),
            },
            personality: 'Cautelosa e reservada',
            motivations: 'Proteger os companheiros.',
            privateNotes: 'SECRET_NPC_UNAUTHORIZED',
          })
        ).id
      : null;
    const shelf = randomUUID(),
      option = randomUUID();
    await local({
      type: 'WORLD_UPSERT',
      entityId: shelf,
      kind: 'OBJECT',
      name: 'Estante',
      description: 'Uma estante de madeira com livros.',
      status: 'INTACT',
      accessible: true,
      visibility: 'PUBLIC',
      reason: 'Preparação sintética autorizada',
      privateNotes: `PRIVATE_CANON_${canon}: ${
        canon === 'ABSENT'
          ? 'Não existe passagem atrás da estante.'
          : canon === 'HIDDEN'
            ? 'Existe uma galeria até o jardim; revelação só após sucesso.'
            : 'Não há fato definido sobre aberturas ou compartimentos.'
      }`,
    });
    await local({
      type: 'SCENE_CONFIGURE',
      targetSessionId: s,
      plan: scenePlanSchema.parse({
        opening,
        presentCharacterIds: npc ? [pc, npc] : [pc],
        options:
          canon === 'HIDDEN'
            ? [
                {
                  id: option,
                  intent: 'Examinar a estante',
                  mode: 'ACT',
                  targetEntityId: shelf,
                  keywords: ['examinar'],
                  check: {
                    ability: 'PERCEPTION',
                    focusId: null,
                    targetNumber: tn,
                    secret: false,
                  },
                  successText:
                    'Um painel atrás da estante conduz à galeria do jardim.',
                  failureText: 'A busca não identificou nenhuma abertura.',
                  witnesses: [],
                  effects: [],
                },
              ]
            : [],
        objectives:
          canon === 'HIDDEN'
            ? [
                {
                  id: randomUUID(),
                  description: 'Examinar a biblioteca',
                  requiredOptionIds: [option],
                },
              ]
            : [],
      }),
    });
    const path = `/api/v1/campaigns/${c}/sessions/${s}`;
    await http().post(`${path}/start`).send({}).expect(200);
    const snapshot = await app.get(NarrativeContextService).build(c, s);
    expect(JSON.stringify(snapshot)).not.toContain('PRIVATE_CANON');
    expect(JSON.stringify(snapshot)).not.toContain('galeria');
    return { c, s, pc, npc, shelf, option, path };
  }
  type Context = Awaited<ReturnType<typeof setup>>;
  const free = (type = 'ADJUDICATE', intent = 'INVESTIGATE') => ({
    kind: 'FREE',
    intent,
    expression: 'DIRECT',
    evidence: [],
    description: 'Tentativa de examinar a estante, sem resultado pressuposto.',
    target: { type: 'WORLD', name: 'Estante' },
    tool:
      type === 'PREPARED_CHECK'
        ? { type, capability: 'Examinar a estante' }
        : { type },
  });
  const send = (ctx: Context, content: string) =>
    http()
      .post(`${ctx.path}/actions`)
      .send({
        actionId: randomUUID(),
        interactionMode: 'ACT',
        content,
      })
      .expect(201);
  const officialState = async (ctx: Context) => ({
    events: await db.db
      .select()
      .from(g.gameEvents)
      .where(eq(g.gameEvents.campaignId, ctx.c))
      .orderBy(g.gameEvents.sequence),
    world: await db.db
      .select()
      .from(g.worldEntities)
      .where(eq(g.worldEntities.campaignId, ctx.c)),
    knowledge: await db.db
      .select()
      .from(n.characterKnowledge)
      .where(eq(n.characterKnowledge.campaignId, ctx.c)),
    health: await db.db
      .select()
      .from(g.characterResources)
      .where(eq(g.characterResources.characterId, ctx.pc)),
    // A new action receipt is expected; compare canonical objective progress.
    progress: await app.get(NarrativeContextService).progress(ctx.c, ctx.s),
    rolls: await db.db
      .select()
      .from(g.diceRolls)
      .where(eq(g.diceRolls.campaignId, ctx.c)),
  });
  const history = async (ctx: Context) =>
    (await http().get(`${ctx.path}/messages`).expect(200)).body.data as {
      role: string;
      content: string;
      metadata: Record<string, unknown> | null;
    }[];

  it.each(['ABSENT', 'UNSPECIFIED'] as const)(
    '%s: does not create a passage, check or categorical absence from missing capability',
    async (canon) => {
      const ctx = await setup(canon);
      const before = await officialState(ctx);
      proposal = free();
      const result = await send(
        ctx,
        'Procuro uma passagem secreta atrás da estante.',
      );
      const after = await officialState(ctx);
      const publicText = (await history(ctx))
        .filter((m) => m.role === 'GAME_MASTER')
        .map((m) => m.content);
      rows.push({
        case: canon === 'ABSENT' ? 'A' : 'C',
        canon,
        publicText,
        officialStateUnchanged:
          JSON.stringify(before) === JSON.stringify(after),
        status: result.body.status,
      });
      expect(result.body.status).toBe('COMPLETED');
      expect(after).toEqual(before);
      expect(publicText.join('\n')).not.toMatch(
        /há uma galeria|existe uma passagem|não existe passagem|PRIVATE_CANON/,
      );
      expect(publicText.at(-1)).toContain('Nenhum efeito foi aplicado');
    },
  );

  it('D: repeated attempts and moving the shelf do not invent discoveries or punishment', async () => {
    const ctx = await setup('ABSENT');
    const before = await officialState(ctx);
    const contents = [
      'Procuro uma passagem secreta.',
      'Tenho certeza de que tem alguma coisa escondida.',
      'Examino novamente.',
      'Empurro a estante para ver o que acontece.',
    ];
    for (const [index, text] of contents.entries()) {
      proposal = free('ADJUDICATE', index === 3 ? 'INTERACT' : 'INVESTIGATE');
      await send(ctx, text);
      expect(await officialState(ctx)).toEqual(before);
    }
    const publicText = (await history(ctx))
      .filter((m) => m.role === 'GAME_MASTER')
      .map((m) => m.content);
    rows.push({
      case: 'D',
      publicText,
      attempts: contents,
      officialStateUnchanged: true,
    });
    expect(publicText.join('\n')).not.toMatch(
      /livro cai|machuca|dano|há uma galeria|PRIVATE_CANON/,
    );
  });

  it.each([
    {
      name: 'literal secret phrase',
      suffix: 'Atrás da estante há uma passagem secreta.',
    },
    {
      name: 'paraphrased secret',
      suffix: 'Atrás da estante há uma galeria que conduz ao jardim.',
    },
  ])(
    'B: with a failed official test, rejects $name from the public narration',
    async ({ name, suffix }) => {
      const ctx = await setup('HIDDEN');
      const before = await officialState(ctx);
      proposal = free('PREPARED_CHECK');
      addedText = suffix;
      const pending = await send(
        ctx,
        'Procuro uma passagem secreta atrás da estante.',
      );
      expect(pending.body.status).toBe('AWAITING_ROLL');
      expect(JSON.stringify(await history(ctx))).not.toContain('galeria');
      await http()
        .post(`${ctx.path}/actions/${pending.body.id}/roll`)
        .send({})
        .expect(200);
      const after = await officialState(ctx);
      const messages = await history(ctx);
      const publicReply = messages
        .filter((m) => m.role === 'GAME_MASTER')
        .at(-1)!;
      const [action] = await db.db
        .select()
        .from(n.narrativeActions)
        .where(eq(n.narrativeActions.id, pending.body.id));
      const injectedVisible = publicReply.content.includes(suffix);
      rows.push({
        case: 'B',
        variant: name,
        scriptedModelAddition: suffix,
        officialSuccess: action!.success,
        officialConfirmed: action!.confirmed,
        publicReply,
        injectedVisible,
        worldUnchanged:
          JSON.stringify(after.world) === JSON.stringify(before.world),
        knowledgeUnchanged:
          JSON.stringify(after.knowledge) === JSON.stringify(before.knowledge),
        events: after.events.map((e) => ({
          type: e.type,
          description: e.description,
          visibility: e.visibility,
        })),
        progress: after.progress,
      });
      expect(action!.success).toBe(false);
      expect(after.world).toEqual(before.world);
      expect(after.knowledge).toEqual(before.knowledge);
      expect(after.progress).toEqual(before.progress);
      expect(after.events.some((e) => e.description.includes(suffix))).toBe(
        false,
      );
      expect(publicReply.content).toBe(
        'A busca não identificou nenhuma abertura.',
      );
      expect(injectedVisible).toBe(false);
      // TEST-CANON-011/012: publication precedes every public channel. Replaying
      // completed requests cannot regenerate or append the rejected prose.
      const get = await http()
        .get(`${ctx.path}/actions/${pending.body.id}`)
        .expect(200);
      const stream = await http()
        .get(`${ctx.path}/actions/${pending.body.id}/stream`)
        .expect(200);
      expect(JSON.stringify(get.body)).not.toContain(suffix);
      expect(stream.text).not.toContain(suffix);
      expect(stream.text).toContain('COMPLETED');
      const saved = await db.db
        .select()
        .from(sessionMessages)
        .where(eq(sessionMessages.id, get.body.masterMessageId));
      expect(saved[0]!.content).toBe(publicReply.content);
      const calls = turn.mock.calls.length;
      await http()
        .post(`${ctx.path}/actions/${pending.body.id}/retry`)
        .send({})
        .expect(200);
      expect(turn.mock.calls.length).toBe(calls);
      expect(await officialState(ctx)).toEqual(after);
    },
  );

  it('B positive control: a successful authorized check can confirm its authored discovery', async () => {
    const ctx = await setup('HIDDEN', 10);
    proposal = free('PREPARED_CHECK');
    const pending = await send(
      ctx,
      'Procuro uma passagem secreta atrás da estante.',
    );
    await http()
      .post(`${ctx.path}/actions/${pending.body.id}/roll`)
      .send({})
      .expect(200);
    const state = await officialState(ctx);
    const publicReply = (await history(ctx))
      .filter((m) => m.role === 'GAME_MASTER')
      .at(-1)!;
    rows.push({ case: 'B-positive', publicReply, officialDiscovery: true });
    expect(publicReply.content).toBe(
      'Um painel atrás da estante conduz à galeria do jardim.',
    );
    expect(state.knowledge).toHaveLength(1);
    expect(state.knowledge[0]!.source).toBe('WITNESSED');
    expect(
      state.events.some((e) => e.description === publicReply.content),
    ).toBe(true);
  });
  it.each(['generation', 'persistence'])(
    'TEST-CANON-011 recovers %s failure without rerolling or duplicating consequences',
    async (failure) => {
      const ctx = await setup('HIDDEN');
      proposal = free('PREPARED_CHECK');
      addedText = 'Atrás da estante há uma galeria que conduz ao jardim.';
      const pending = await send(
        ctx,
        'Procuro uma passagem secreta atrás da estante.',
      );
      if (failure === 'generation') failNarration = true;
      else {
        await db.db.execute(
          sql`CREATE FUNCTION phase562_reject_master() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.role = 'GAME_MASTER' THEN RAISE EXCEPTION 'synthetic failure'; END IF; RETURN NEW; END $$`,
        );
        await db.db.execute(
          sql`CREATE TRIGGER phase562_reject_master BEFORE INSERT ON session_messages FOR EACH ROW EXECUTE FUNCTION phase562_reject_master()`,
        );
      }
      try {
        const result = await http()
          .post(`${ctx.path}/actions/${pending.body.id}/roll`)
          .send({})
          .expect(200);
        expect(result.body.status).toBe('COMMITTED');
        expect(
          (await history(ctx)).filter((m) => m.role === 'GAME_MASTER'),
        ).toHaveLength(0);
      } finally {
        if (failure === 'persistence') {
          await db.db.execute(
            sql`DROP TRIGGER phase562_reject_master ON session_messages`,
          );
          await db.db.execute(sql`DROP FUNCTION phase562_reject_master()`);
        }
      }
      const before = await officialState(ctx);
      const retry = await http()
        .post(`${ctx.path}/actions/${pending.body.id}/retry`)
        .send({})
        .expect(200);
      expect(retry.body.status).toBe('COMPLETED');
      expect(await officialState(ctx)).toEqual(before);
      const replies = (await history(ctx)).filter(
        (m) => m.role === 'GAME_MASTER',
      );
      expect(replies).toHaveLength(1);
      expect(replies[0]!.content).toBe(
        'A busca não identificou nenhuma abertura.',
      );
      expect(replies[0]!.metadata?.deterministicFallback).toBe(true);
      rows.push({
        case: `TEST-CANON-011-${failure}`,
        status: retry.body.status,
        publicReply: replies[0],
        officialStateUnchangedOnRetry: true,
      });
    },
  );

  it.each(['WITNESSED', 'RUMOR'] as const)(
    'TEST-CANON-007/008 publishes attributed %s, preserves memory and isolates private knowledge',
    async (source) => {
      const ctx = await setup('ABSENT', 30, true);
      const addFact = async (
        characterId: string,
        description: string,
        origin: typeof source,
      ) => {
        const event = await engine.executeInternal({
          campaignId: ctx.c,
          sessionId: ctx.s,
          commandId: randomUUID(),
          command: {
            type: 'EVENT_RECORD',
            eventType: 'CONSEQUENCE_RECORDED',
            description,
            participants: [characterId],
            visibility: 'PLAYER_ONLY',
          },
        });
        await db.db.insert(n.characterKnowledge).values({
          campaignId: ctx.c,
          characterId,
          eventId: event.id,
          source: origin,
          importance: 90,
        });
        return event.id;
      };
      const own = await addFact(
        ctx.npc!,
        source === 'RUMOR'
          ? 'Dizem que há uma passagem atrás da biblioteca.'
          : 'Aren acusou Mira durante uma discussão.',
        source,
      );
      await addFact(
        ctx.pc,
        'SECRET_PC_ONLY: identidade do culpado.',
        'WITNESSED',
      );
      const before = await officialState(ctx);
      proposal = {
        kind: 'FREE',
        intent: 'TALK',
        expression: 'QUESTION',
        evidence: [],
        description: 'Perguntar a Mira',
        target: { type: 'CHARACTER', name: 'Mira' },
        tool: { type: 'DIALOGUE' },
      };
      renderOutput = (input) => {
        const rendering = input.context.rendering!;
        expect(JSON.stringify(rendering)).not.toContain('SECRET_');
        const beats = rendering.publication!.choices.filter(
          (b) =>
            b.kind === 'DIALOGUE' &&
            ((!b.factIds.length && b.text.includes('Prefiro cautela')) ||
              b.factIds.includes(own)),
        );
        return {
          narrative: beats.map((b) => b.text).join('\n\n'),
          eventIds: input.confirmed!.eventIds,
          beats,
        };
      };
      const result = await http()
        .post(`${ctx.path}/actions`)
        .send({
          actionId: randomUUID(),
          interactionMode: 'SPEAK',
          content: 'Mira, o que você lembra? Ainda desconfio de Aren.',
        })
        .expect(201);
      expect(result.body.status).toBe('COMPLETED');
      const reply = (await history(ctx))
        .filter((m) => m.role === 'GAME_MASTER')
        .at(-1)!;
      expect(reply.content).toContain('Mira — Prefiro cautela');
      expect(reply.content).not.toContain('SECRET_');
      if (source === 'RUMOR')
        expect(reply.content).toContain(
          'Ouvi este rumor, mas não posso confirmá-lo',
        );
      const after = await officialState(ctx);
      expect(after.world).toEqual(before.world);
      expect(after.health).toEqual(before.health);
      expect(after.progress).toEqual(before.progress);
      expect(after.rolls).toEqual(before.rolls);
      const event = after.events.filter((e) => e.type === 'NPC_REPLY_RECORDED');
      expect(event).toHaveLength(1);
      expect(event[0]!.description).toContain(
        'fala atribuída, não verdade do mundo',
      );
      expect(
        after.knowledge.filter((k) => k.eventId === event[0]!.id).length,
      ).toBeGreaterThan(0);
      expect(
        after.knowledge
          .filter((k) => k.eventId === event[0]!.id)
          .every((k) => k.source === 'HEARD'),
      ).toBe(true);
      rows.push({
        case: `TEST-CANON-${source === 'RUMOR' ? '008' : '007'}`,
        publicReply: reply,
        attribution: event[0]!.description,
        knowledge: after.knowledge
          .filter((k) => k.eventId === event[0]!.id)
          .map((k) => k.source),
      });
    },
  );
  it('TEST-CANON-006 persists expressive authorized composition through the production graph', async () => {
    const atmosphere =
      'A luz dourada repousa nas lombadas gastas; a madeira conserva o brilho do verniz.';
    const ctx = await setup('HIDDEN', 30, false, atmosphere);
    proposal = free('PREPARED_CHECK');
    renderOutput = (input) => {
      const beats = input.context.rendering!.publication!.choices.filter(
        (b) =>
          b.kind === 'RESULT' ||
          b.text === atmosphere ||
          b.text === 'Como deseja prosseguir?',
      );
      return {
        narrative: beats.map((b) => b.text).join('\n\n'),
        eventIds: input.confirmed!.eventIds,
        beats,
      };
    };
    const pending = await send(
      ctx,
      'Examino a estante procurando algo escondido.',
    );
    await http()
      .post(`${ctx.path}/actions/${pending.body.id}/roll`)
      .send({})
      .expect(200);
    const reply = (await history(ctx))
      .filter((m) => m.role === 'GAME_MASTER')
      .at(-1)!;
    expect(reply.content).toBe(
      `A busca não identificou nenhuma abertura.\n\n${atmosphere}\n\nComo deseja prosseguir?`,
    );
    expect(reply.metadata?.deterministicFallback).toBe(false);
    expect((await officialState(ctx)).knowledge).toHaveLength(0);
    rows.push({
      case: 'TEST-CANON-006',
      publicReply: reply,
      officialDiscovery: false,
    });
  });
});
