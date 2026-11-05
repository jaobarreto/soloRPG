import { GLOAMHALE_ADVENTURES } from '../../src/adventures/gloamhale/gloamhale.module';
import {
  gloamhaleModule,
  gloamhaleVersion,
} from '../../src/adventures/gloamhale/gloamhale-module';
import { gloamhaleV2 } from '../../src/adventures/gloamhale/definitions/v2/gloamhale-v2';
import { gloamhaleV3 } from '../../src/adventures/gloamhale/definitions/v3/gloamhale-v3';
import { gloamhaleV4 } from '../../src/adventures/gloamhale/definitions/v4/gloamhale-v4';
import { gloamhaleV5 } from '../../src/adventures/gloamhale/definitions/v5/gloamhale-v5';
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { and, asc, eq, sql } from 'drizzle-orm';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { AdventureService } from '../../src/adventures/core/operations/adventure.service';
import { planningReceiptId } from '../../src/adventures/core/director/planning';
import { digest, loadAdventure } from '../../src/adventures/core/state/state';
import { travelOpening } from '../../src/adventures/gloamhale/travel-opening';
import { adventureDefinitions } from '../../src/database/adventure-schema';
import { DatabaseService } from '../../src/database/database.service';
import * as g from '../../src/database/game-schema';
import { librarySessionResets } from '../../src/database/library-schema';
import {
  narrativeActions,
  characterKnowledge,
} from '../../src/database/narrative-schema';
import {
  campaigns,
  campaignSessions,
  sessionMessages,
} from '../../src/database/schema';
import { GameEngineService } from '../../src/game-engine/game-engine.service';
import { AiServiceClient } from '../../src/integrations/ai-service/ai-service.client';

type Execution = { campaignId: string; sessionId: string };
type DiaryEntry = {
  content: string;
  id: string;
  role: string;
  interactionMode?: string;
  metadata?: Record<string, unknown>;
};

describe('Library session reset and grouped narrative publication / PostgreSQL', () => {
  let app: INestApplication;
  let db: DatabaseService;
  const fake = (input: { stage: string; confirmed?: unknown }) => ({
    proposal: input.stage === 'PROPOSE' ? { kind: 'OBSERVE' } : null,
    narration: input.stage === 'NARRATE' ? input.confirmed : null,
    usage: [],
    error: null,
  });
  const turn = jest.fn(async (input: Parameters<typeof fake>[0]) =>
    fake(input),
  );
  const http = () => request(app.getHttpServer());
  const library = '/api/v1/campaigns/library';
  const base = (id: string) => `/api/v1/campaigns/${id}`;
  const play = (run: Execution) =>
    `${base(run.campaignId)}/sessions/${run.sessionId}`;
  const diary = async (run: Execution): Promise<DiaryEntry[]> =>
    (
      await http()
        .get(`${play(run)}/messages`)
        .expect(200)
    ).body.data;
  const state = async (run: Execution) =>
    (
      await http()
        .get(`${play(run)}/narrative-state`)
        .expect(200)
    ).body;
  const open = async (): Promise<Execution> => {
    const { body } = await http().post(library).expect(200);
    return { campaignId: body.campaignId, sessionId: body.session.id };
  };
  const start = async (run: Execution, companions: string[] = []) => {
    const path = `${base(run.campaignId)}/preparation`;
    const { body } = await http().post(path).expect(200);
    await http()
      .post(`${path}/confirm`)
      .send({
        confirmed: true,
        companions,
        revision: body.adventure.revision,
      })
      .expect((response) => {
        if (response.status !== 200)
          throw new Error(JSON.stringify(response.body));
      })
      .expect(200);
    await http()
      .post(`${play(run)}/start`)
      .expect(200);
  };
  const queue = async (
    run: Execution,
    interactionMode: string,
    content: string,
  ) => {
    const id = randomUUID();
    await http()
      .post(`${play(run)}/messages/queue`)
      .send({ id, interactionMode, content })
      .expect(201);
    return id;
  };
  const advance = (run: Execution, id = randomUUID()) =>
    http()
      .post(`${play(run)}/continue`)
      .send({ id });
  const reset = (run: Execution) =>
    http()
      .post(`${play(run)}/reset`)
      .send({ confirm: true });

  beforeAll(async () => {
    const current = gloamhaleVersion(gloamhaleV5);
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GLOAMHALE_ADVENTURES)
      .useValue([
        gloamhaleModule,
        ...[gloamhaleV2, gloamhaleV3, gloamhaleV4].map(gloamhaleVersion),
        {
          ...current,
          guidedRelease: {
            ...current.guidedRelease!,
            campaignId: randomUUID(),
          },
        },
      ])
      .overrideProvider(AiServiceClient)
      .useValue({ turn })
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    db = app.get(DatabaseService);
    await migrate(db.db, {
      migrationsFolder: resolve(__dirname, '../../drizzle'),
    });
  });
  afterAll(async () => {
    if (app) await app.close();
  });

  it('replaces only the selected execution, stages one continuation, and fences late writers', async () => {
    const adventure = app.get(AdventureService);
    const engine = app.get(GameEngineService);
    const older = await open();
    const independent: string[] = [];
    for (const version of [1, 2, 3, 4, 5]) {
      const campaignId = randomUUID();
      await adventure.execute({
        operation: 'IMPORT',
        campaignId,
        commandId: randomUUID(),
        version,
      });
      independent.push(campaignId);
    }
    const independentCampaign = independent.at(-1)!;
    const preserved = async () => ({
      definitions: await db.db
        .select({
          id: adventureDefinitions.id,
          digest: adventureDefinitions.digest,
        })
        .from(adventureDefinitions)
        .orderBy(asc(adventureDefinitions.id)),
      campaign: await db.db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, independentCampaign)),
      sessions: await db.db
        .select()
        .from(campaignSessions)
        .where(eq(campaignSessions.campaignId, independentCampaign))
        .orderBy(asc(campaignSessions.sessionNumber)),
      commands: await db.db
        .select()
        .from(g.gameCommands)
        .where(eq(g.gameCommands.campaignId, independentCampaign)),
    });
    const before = await preserved();
    const originalCampaignCount = (await db.db.select().from(campaigns)).length;
    expect(before.definitions).toHaveLength(5);
    expect(before.commands).toHaveLength(1);
    const currentPlan = (await loadAdventure(older.campaignId, db.db))!
      .planning!;
    const olderPlan = { ...currentPlan, revision: 'gloamhale-editorial-1' };
    await db.db
      .update(g.gameCommands)
      .set({ result: olderPlan, digest: digest(olderPlan) })
      .where(
        and(
          eq(g.gameCommands.campaignId, older.campaignId),
          eq(g.gameCommands.commandId, planningReceiptId(older.campaignId)),
        ),
      );
    await start(older);
    const legacy = await diary(older);
    expect(legacy).toHaveLength(1);
    expect(legacy[0]?.metadata?.openingRevision).toBe('canonical-scene-v1');
    expect(legacy[0]?.content).not.toBe(travelOpening);
    expect(await open()).toEqual(older);
    await http()
      .post(`${play(older)}/start`)
      .expect(200);
    expect(await diary(older)).toEqual(legacy);
    await http()
      .post(`${play(older)}/reset`)
      .send({})
      .expect(400);
    await http()
      .post(`${play(older)}/reset`)
      .send({ confirm: false })
      .expect(400);
    await reset({ ...older, sessionId: randomUUID() }).expect(404);
    const run = (await reset(older).expect(200)).body as Execution;
    expect(run.campaignId).not.toBe(older.campaignId);
    expect(run.sessionId).not.toBe(older.sessionId);
    expect(await diary(run)).toEqual([]);
    expect(await open()).toEqual(run);
    const [firstReset] = await db.db
      .select()
      .from(librarySessionResets)
      .where(eq(librarySessionResets.previousCampaignId, older.campaignId));
    expect(firstReset).toMatchObject({
      previousPlanning: 'gloamhale-editorial-1',
      previousOpening: 'canonical-scene-v1',
      replacementPlanning: currentPlan.revision,
      replacementOpening: 'gloamhale-travel-a1-3-v1',
    });
    await start(run, ['aren']);
    const opening = travelOpening.replace('{{nome_da_personagem}}', 'Naelis');
    expect((await diary(run)).map((row) => row.content)).toEqual([opening]);

    const thought =
      'Naelis sente saudade de sua mãe e teme não estar preparada para esta missão.';
    const queued = [
      await queue(run, 'THINK', thought),
      await queue(run, 'SPEAK', 'O que aconteceu?'),
      await queue(run, 'ACT', 'Desço do cavalo.'),
    ];
    expect(turn).not.toHaveBeenCalled();
    expect(
      (await diary(run))
        .slice(1)
        .map(({ id, interactionMode }) => [id, interactionMode]),
    ).toEqual(
      queued.map((id, index) => [id, ['THINK', 'SPEAK', 'ACT'][index]]),
    );
    await http()
      .post(`${play(run)}/pause`)
      .expect(200);
    expect(
      (await diary(run)).slice(1).every((row) => row.metadata?.queued),
    ).toBe(true);
    await http()
      .post(`${play(run)}/resume`)
      .expect(200);

    let releaseSpeech!: () => void;
    let speechEntered!: () => void;
    const atSpeech = new Promise<void>((resolve) => {
      speechEntered = resolve;
    });
    const waitSpeech = new Promise<void>((resolve) => {
      releaseSpeech = resolve;
    });
    turn.mockImplementationOnce(async (input) => {
      speechEntered();
      await waitSpeech;
      return fake(input);
    });
    const batchId = randomUUID();
    const processing = advance(run, batchId).then((response) => response);
    await atSpeech;
    const aliasId = randomUUID();
    await advance(run, aliasId).expect(200);
    expect(
      (await diary(run)).filter((row) => row.role === 'GAME_MASTER'),
    ).toHaveLength(1);
    releaseSpeech();
    expect((await processing).status).toBe(200);
    await advance(run, batchId).expect(200);
    await advance(run, aliasId).expect(200);
    const grouped = await diary(run);
    expect(grouped).toHaveLength(5);
    expect(grouped[4]).toMatchObject({
      role: 'GAME_MASTER',
      metadata: { batchContinuation: true },
    });
    expect(grouped[4]?.content).toMatch(/carroça/i);
    expect(grouped[4]?.content).toMatch(/desmont/i);
    expect(grouped[4]?.content).not.toContain(thought);
    expect(turn.mock.calls.map(([input]) => input)).toMatchObject([
      { interactionMode: 'SPEAK', playerMessage: 'O que aconteceu?' },
      { interactionMode: 'ACT', playerMessage: 'Desço do cavalo.' },
    ]);
    expect(JSON.stringify(turn.mock.calls)).not.toContain(thought);
    expect(
      await db.db
        .select()
        .from(narrativeActions)
        .where(eq(narrativeActions.id, queued[0]!)),
    ).toEqual([]);
    expect(
      JSON.stringify(
        await db.db
          .select()
          .from(characterKnowledge)
          .where(eq(characterKnowledge.campaignId, run.campaignId)),
      ),
    ).not.toContain(queued[0]);
    const partial = await state(run);
    expect(partial.progress).toBe(45);
    expect(partial.mounts).toHaveLength(2);
    const eventCount = async () =>
      (
        await db.db
          .select({ id: g.gameEvents.id })
          .from(g.gameEvents)
          .where(eq(g.gameEvents.campaignId, run.campaignId))
      ).length;
    const beforeIdle = await eventCount();
    await advance(run).expect(200);
    const idle = await diary(run);
    await advance(run).expect(200);
    expect(await diary(run)).toEqual(idle);
    expect(await eventCount()).toBe(beforeIdle);

    const protagonist = (await loadAdventure(run.campaignId, db.db))!.instance
      .protagonistId!;
    const horse = partial.mounts.find(
      (entry: { name: string }) => entry.name === 'Cavalo de Naelis',
    );
    const local = (command: unknown) =>
      engine.executeInternal({
        ...run,
        commandId: randomUUID(),
        command,
      });
    await local({
      type: 'RESOURCE_SET',
      characterId: protagonist,
      name: 'HEALTH',
      current: 9,
      maximum: 23,
      reason: 'Recurso alterado durante esta partida de teste.',
    });
    await local({
      type: 'MOUNT_DAMAGE',
      characterId: horse.id,
      damage: 45,
      reason: 'Montaria ferida nesta partida de teste.',
    });
    expect(
      (await state(run)).mounts.find(
        (entry: { id: string }) => entry.id === horse.id,
      ),
    ).toMatchObject({ health: 0, mounted: false, lifeState: 'DEAD' });
    await queue(run, 'THINK', 'Entrada ainda pendente.');
    const beforeFailure = await diary(run);
    await db.db
      .execute(sql`CREATE FUNCTION reject_reset_test() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'injected failure after scoped deletions'; END;
    $$`);
    await db.db
      .execute(sql`CREATE TRIGGER reject_reset_test BEFORE DELETE ON campaigns
      FOR EACH ROW EXECUTE FUNCTION reject_reset_test()`);
    try {
      await reset(run).expect(500);
    } finally {
      await db.db.execute(sql`DROP TRIGGER reject_reset_test ON campaigns`);
      await db.db.execute(sql`DROP FUNCTION reject_reset_test()`);
    }
    expect(await diary(run)).toEqual(beforeFailure);
    expect(await open()).toEqual(run);
    expect((await state(run)).progress).toBe(45);

    let releaseLate!: () => void;
    let lateEntered!: () => void;
    const atLate = new Promise<void>((resolve) => {
      lateEntered = resolve;
    });
    const waitLate = new Promise<void>((resolve) => {
      releaseLate = resolve;
    });
    turn.mockImplementationOnce(async (input) => {
      lateEntered();
      await waitLate;
      return fake(input);
    });
    await queue(run, 'ACT', 'Sigo para Lakesheart.');
    const lateId = randomUUID();
    const late = advance(run, lateId).then((response) => response);
    await atLate;
    await queue(run, 'THINK', 'Entrada simultânea ao turno em andamento.');
    const copies = await Promise.all([
      reset(run).expect(200),
      reset(run).expect(200),
    ]);
    const fresh = copies[0].body as Execution;
    expect(copies[1].body).toEqual(fresh);
    releaseLate();
    expect((await late).status).toBe(404);
    await advance(run, lateId).expect(404);
    await http()
      .get(`${play(run)}/messages`)
      .expect(404);
    await http()
      .post(`${play(run)}/messages/queue`)
      .send({
        id: randomUUID(),
        interactionMode: 'ACT',
        content: 'Mensagem tardia.',
      })
      .expect(404);
    await http()
      .post('/api/v1/campaigns')
      .send({ requestId: run.campaignId, title: 'Partida apagada' })
      .expect(409);
    await expect(
      adventure.execute({
        operation: 'IMPORT',
        campaignId: run.campaignId,
        commandId: randomUUID(),
        version: 5,
      }),
    ).rejects.toThrow('descartada');
    expect(await diary(fresh)).toEqual([]);
    expect(await open()).toEqual(fresh);
    expect(await db.db.select().from(campaigns)).toHaveLength(
      originalCampaignCount,
    );
    expect(await preserved()).toEqual(before);
    for (const table of [
      sessionMessages,
      narrativeActions,
      g.gameCommands,
      g.characters,
      g.gameEvents,
      g.worldEntities,
      g.campaignMounts,
      characterKnowledge,
    ]) {
      expect(
        await db.db
          .select()
          .from(table)
          .where(eq(table.campaignId, run.campaignId)),
      ).toEqual([]);
    }
    await start(fresh);
    await http()
      .post(`${play(fresh)}/start`)
      .expect(200);
    expect((await diary(fresh)).map((row) => row.content)).toEqual([opening]);
    const freshState = await state(fresh);
    expect(freshState.progress).toBe(0);
    expect(freshState.mounts).toMatchObject([
      { health: 45, maxHealth: 45, lifeState: 'ALIVE', mounted: true },
    ]);
    const freshProtagonist = (await loadAdventure(fresh.campaignId, db.db))!
      .instance.protagonistId!;
    const [freshHealth] = await db.db
      .select()
      .from(g.characterResources)
      .where(
        and(
          eq(g.characterResources.characterId, freshProtagonist),
          eq(g.characterResources.name, 'HEALTH'),
        ),
      );
    expect(freshHealth).toMatchObject({ current: 23, maximum: 23 });
    const check = await engine.executeInternal({
      ...fresh,
      commandId: randomUUID(),
      command: {
        type: 'CHECK_PREPARE',
        characterId: freshProtagonist,
        ability: 'PERCEPTION',
        targetNumber: 12,
        reason: 'Pendência mecânica autorizada na fixture.',
        visibility: 'PUBLIC',
      },
    });
    await advance(fresh).expect(200);
    expect((await diary(fresh)).map((row) => row.content)).toEqual([opening]);
    const [pendingCheck] = await db.db
      .select()
      .from(g.checkRequests)
      .where(eq(g.checkRequests.id, check.id));
    expect(pendingCheck?.resolved).toBe(false);
    const libraryState = (await http().get(library).expect(200)).body;
    expect(
      libraryState.sessions
        .slice(1)
        .map((row: { status: string }) => row.status),
    ).toEqual(Array(6).fill('LOCKED'));
  });
});
