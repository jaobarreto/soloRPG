import { travelOpening } from '../../src/adventures/gloamhale/travel-opening';
import { sessionPlans } from '../../src/database/narrative-schema';
import { legacyEntityNamespace } from '../../src/adventures/gloamhale/default-adventure';
import { gloamhaleState } from '../../src/adventures/gloamhale/runtime/state/mechanics-state';
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq, sql } from 'drizzle-orm';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { DatabaseService } from '../../src/database/database.service';
import { AdventureRegistry } from '../../src/adventures/core/registry/registry';
import { AdventureService } from '../../src/adventures/core/operations/adventure.service';
import { GameEngineService } from '../../src/game-engine/game-engine.service';
import { AiServiceClient } from '../../src/integrations/ai-service/ai-service.client';
import { NarrativeContextService } from '../../src/narrative/context.service';
import {
  adventureEntityId,
  digest,
  loadAdventure,
} from '../../src/adventures/core/state/state';
import { gloamhaleV4 } from '../../src/adventures/gloamhale/definitions/v4/gloamhale-v4';
import { gloamhale } from '../../src/adventures/gloamhale/definitions/v1/gloamhale';
import * as a from '../../src/database/adventure-schema';
import * as g from '../../src/database/game-schema';
import { RANDOM_SOURCE } from '../../src/blue-rose/mechanics/dice/blue-rose-dice';

describe('Gloamhale: private import, supplied party and continuity / PostgreSQL', () => {
  let app: INestApplication,
    db: DatabaseService,
    adventure: AdventureService,
    engine: GameEngineService;
  const turn = jest.fn();
  const random = { d6: jest.fn(() => 4) };
  const http = () => request(app.getHttpServer());
  const local = (campaignId: string, command: unknown, sessionId?: string) =>
    engine.executeInternal({
      campaignId,
      sessionId,
      commandId: randomUUID(),
      command,
    });
  const command = (campaignId: string, data: Record<string, unknown>) =>
    adventure.execute({ campaignId, commandId: randomUUID(), ...data });
  const imported = async (version?: number) => {
    const campaignId = randomUUID();
    await command(campaignId, {
      operation: 'IMPORT',
      ...(version ? { adventureId: gloamhale.id, version } : {}),
    });
    return {
      campaignId,
      sessionId: adventureEntityId(
        campaignId,
        'session-1',
        legacyEntityNamespace,
      ),
      secondId: adventureEntityId(
        campaignId,
        'session-2',
        legacyEntityNamespace,
      ),
    };
  };
  const prepared = async (version?: number) => {
    const c = await imported(version);
    await command(c.campaignId, {
      operation: 'TRANSCRIBE_SUPPLIED_PARTY',
      confirmSourceTranscription: true,
    });
    const report = await adventure.status(c.campaignId);
    expect(report.review.errors).toEqual([]);
    await command(c.campaignId, {
      operation: 'REVIEW_PARTY',
      expectedDigest: report.snapshotDigest,
      sourceReview:
        'Fichas e revisão de povos conferidas com o livro; regras manuais assumidas pelo operador.',
      manualRulesAccepted: true,
    });
    await command(c.campaignId, {
      operation: 'SCENE',
      sessionId: c.sessionId,
      sceneKey: 'foiled-trap',
      reason: 'O grupo chegou à estrada onde ocorre o primeiro encontro.',
    });
    return c;
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AiServiceClient)
      .useValue({ turn })
      .overrideProvider(RANDOM_SOURCE)
      .useValue(random)
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
    if (app) await app.close();
  });
  beforeEach(() =>
    turn.mockReset().mockImplementation(async (input) => ({
      proposal:
        input.stage === 'PROPOSE'
          ? input.context.selectedMechanic
            ? { kind: 'MECHANIC', command: input.context.selectedMechanic }
            : input.context.selectedOptionId
              ? { kind: 'SCENE', optionId: input.context.selectedOptionId }
              : { kind: 'OBSERVE' }
          : null,
      narration: input.stage === 'NARRATE' ? input.confirmed : null,
      usage: [],
      error: null,
    })),
  );
  beforeEach(() => random.d6.mockReset().mockReturnValue(4));
  const insideManor = async (version?: number) => {
    const c = await prepared(version);
    await http()
      .post(`/api/v1/campaigns/${c.campaignId}/sessions/${c.sessionId}/start`)
      .send({})
      .expect(200);
    await command(c.campaignId, {
      operation: 'SCENE',
      sessionId: c.sessionId,
      sceneKey: 'reborn',
      reason: 'O grupo inteiro entrou na mansão segundo decisão confirmada.',
    });
    const cast = await db.db
      .select()
      .from(g.characters)
      .where(eq(g.characters.campaignId, c.campaignId));
    const input = {
      campaignId: c.campaignId,
      sessionId: c.sessionId,
      commandId: randomUUID(),
      operation: 'GLOAMHALE_ENTER',
      children: cast.map((p) => ({
        characterId: p.id,
        age: 10,
        fear: 'Memória fornecida e aprovada pela jogadora nesta fixture.',
      })),
      playerApprovedMemories: true,
      reason: 'Entrada e idades confirmadas localmente; não inventar medos.',
    };
    await adventure.execute(input);
    await adventure.execute(input);
    return { ...c, cast, pc: cast.find((p) => p.kind === 'PROTAGONIST')! };
  };
  it('imports and reopens all five registered versions without rebinding historical campaigns', async () => {
    for (const version of [1, 2, 3, 4, 5]) {
      const { campaignId, sessionId } = await imported(version);
      const definitionId = `${gloamhale.id}:v${version}`;
      const [stored] = await db.db
        .select()
        .from(a.adventureDefinitions)
        .where(eq(a.adventureDefinitions.id, definitionId));
      expect(stored?.definition).toMatchObject({ id: gloamhale.id, version });
      // PostgreSQL JSONB sorts keys. The registry regression pins the pre-import serialization.
      expect(stored?.digest).toBe(
        digest(
          app.get(AdventureRegistry).get(gloamhale.id, version).definition,
        ),
      );
      await expect(
        command(campaignId, {
          operation: 'IMPORT',
          adventureId: gloamhale.id,
          version,
        }),
      ).resolves.toMatchObject({ imported: false });
      const [reopened] = await db.db
        .select()
        .from(a.adventureInstances)
        .where(eq(a.adventureInstances.campaignId, campaignId));
      expect(reopened?.definitionId).toBe(definitionId);
      await http()
        .get(`/api/v1/campaigns/${campaignId}/sessions/${sessionId}`)
        .expect(200);
    }
    const response = await http()
      .post('/api/v1/campaigns')
      .send({
        title: 'Campanha nova',
      })
      .expect(201);
    const [created] = await db.db
      .select()
      .from(a.adventureInstances)
      .where(eq(a.adventureInstances.campaignId, response.body.id as string));
    expect(created?.definitionId).toBe(`${gloamhale.id}:v5`);
  });

  it('prepares, reviews and opens a web campaign once, even with Una’s provider offline', async () => {
    turn.mockRejectedValue(new Error('Provider offline'));
    const requestId = randomUUID();
    const create = (title: string) =>
      http().post('/api/v1/campaigns').send({ title, requestId });
    const [{ body: campaign }, { body: repeated }] = await Promise.all([
      create('Marco A.1').expect(201),
      create('Marco A.1').expect(201),
    ]);
    expect(campaign.id).toBe(repeated.id);
    expect(
      campaign.sessions.map((session: { id: string }) => session.id),
    ).toEqual(repeated.sessions.map((session: { id: string }) => session.id));
    await create('Título diferente').expect(409);
    const base = `/api/v1/campaigns/${campaign.id}`;
    const setup = `${base}/preparation`;
    const session = `${base}/sessions/${campaign.sessions[0].id}`;
    const state = async () =>
      (await http().get(setup).expect(200)).body.adventure;
    const confirm = (revision: string) =>
      http().post(`${setup}/confirm`).send({ revision, confirmed: true });

    expect(await state()).toMatchObject({ version: 5, needsParty: true });
    await http().post(`${session}/start`).expect(409);
    await Promise.all([
      http().post(setup).expect(200),
      http().post(setup).expect(200),
    ]);
    const prepared = await state();
    expect(prepared).toMatchObject({
      needsParty: false,
      reviewed: false,
      errors: [],
    });
    expect(
      prepared.sheets.map((sheet: { name: string }) => sheet.name),
    ).toEqual(['Naelis', 'Aren Valdren', 'Mira Selwyn', 'Lys Varen']);
    expect(prepared.sheets[0]).toMatchObject({
      kind: 'PROTAGONIST',
      people: "Vata'an",
      characterClass: 'ADEPT',
      equipment: expect.arrayContaining([
        expect.objectContaining({ name: 'Cajado artesanal de Ahri' }),
      ]),
    });
    expect(JSON.stringify(prepared)).not.toMatch(
      /privateNotes|privateObjectives|incidente da passagem|gmSecrets/,
    );
    await confirm('0'.repeat(64)).expect(409);
    await http()
      .post(`${setup}/confirm`)
      .send({ revision: prepared.revision })
      .expect(400);
    const cast = await db.db
      .select()
      .from(g.characters)
      .where(eq(g.characters.campaignId, campaign.id));
    const aren = cast.find((row) => row.name === 'Aren Valdren')!;
    const naelis = cast.find((row) => row.name === 'Naelis')!;
    await db.db
      .update(g.characters)
      .set({ kind: 'COMPANION' })
      .where(eq(g.characters.id, naelis.id));
    const invalid = await state();
    expect(invalid.errors).not.toHaveLength(0);
    await confirm(invalid.revision).expect(400);
    await db.db
      .update(g.characters)
      .set({ kind: 'PROTAGONIST' })
      .where(eq(g.characters.id, naelis.id));
    await confirm(prepared.revision).expect(200);
    const [instance] = await db.db
      .select()
      .from(a.adventureInstances)
      .where(eq(a.adventureInstances.campaignId, campaign.id));
    expect(instance?.protagonistId).toBe(naelis.id);
    expect(instance?.reviewedDigest).toBe(prepared.revision);

    await local(campaign.id, {
      type: 'ABILITY_SET',
      characterId: naelis!.id,
      ability: 'STRENGTH',
      score: 1,
      reason: 'Alteração para invalidar a conferência da ficha.',
    });
    expect((await state()).reviewed).toBe(false);
    await http().post(`${session}/start`).expect(409);
    const revised = await state();
    await confirm(revised.revision).expect(200);
    await confirm(revised.revision).expect(200);
    await db.db
      .update(a.adventureInstances)
      .set({ protagonistId: aren!.id })
      .where(eq(a.adventureInstances.campaignId, campaign.id));
    await http().post(`${session}/start`).expect(409);
    await db.db
      .update(a.adventureInstances)
      .set({ protagonistId: naelis!.id })
      .where(eq(a.adventureInstances.campaignId, campaign.id));
    await db.db
      .execute(sql`CREATE FUNCTION reject_a1_opening() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.role = 'GAME_MASTER' THEN RAISE EXCEPTION 'publication write failed'; END IF; RETURN NEW; END $$`);
    await db.db
      .execute(sql`CREATE TRIGGER reject_a1_opening BEFORE INSERT ON session_messages
      FOR EACH ROW EXECUTE FUNCTION reject_a1_opening()`);
    try {
      await http().post(`${session}/start`).expect(500);
      expect((await http().get(session).expect(200)).body.status).toBe(
        'AVAILABLE',
      );
      expect(
        (await http().get(`${session}/messages`).expect(200)).body.data,
      ).toEqual([]);
      expect(
        await db.db
          .select()
          .from(a.adventureScenes)
          .where(eq(a.adventureScenes.sessionId, campaign.sessions[0].id)),
      ).toEqual([]);
    } finally {
      await db.db.execute(
        sql`DROP TRIGGER reject_a1_opening ON session_messages`,
      );
      await db.db.execute(sql`DROP FUNCTION reject_a1_opening()`);
    }
    await Promise.all([
      http().post(`${session}/start`).expect(200),
      http().post(`${session}/start`).expect(200),
    ]);
    const { body: history } = await http()
      .get(`${session}/messages`)
      .expect(200);
    expect(history.data).toMatchObject([
      {
        role: 'GAME_MASTER',
        content: gloamhale.scenes[0]!.opening,
        sequenceNumber: 1,
      },
    ]);
    expect(history.data).toHaveLength(1);
    const openingEvents = await db.db
      .select()
      .from(g.gameEvents)
      .where(eq(g.gameEvents.sessionId, campaign.sessions[0].id));
    expect(
      openingEvents.filter((event) => event.type === 'ADVENTURE_SPATIAL_STATE'),
    ).toMatchObject([{ changes: { arrival: 'road' } }]);
    expect(
      openingEvents.filter((event) => event.type === 'ADVENTURE_SPATIAL_STATE'),
    ).toHaveLength(1);

    await http().post(`${session}/pause`).expect(200);
    await http().post(`${session}/resume`).expect(200);
    expect((await http().get(`${session}/messages`).expect(200)).body).toEqual(
      history,
    );
    expect(turn).not.toHaveBeenCalled();
  });

  it('preserves an incomplete draft with existing sheets and keeps unknown members private', async () => {
    const { campaignId, sessionId } = await imported(5);
    const setup = `/api/v1/campaigns/${campaignId}/preparation`;
    const [partial] = await db.db
      .insert(g.characters)
      .values({
        campaignId,
        name: 'Naelis',
        people: "Vata'an",
        kind: 'PROTAGONIST',
        known: true,
        characterClass: 'ADEPT',
        background: 'Povo da Floresta',
        level: 1,
      })
      .returning();
    const { body } = await http().post(setup).expect(200);
    expect(body.adventure).toMatchObject({
      available: true,
      needsParty: false,
      reviewed: false,
      sheets: [{ name: 'Naelis', health: null, armor: null, shield: null }],
    });
    expect(body.adventure.errors).not.toHaveLength(0);
    await http()
      .post(`${setup}/confirm`)
      .send({ revision: body.adventure.revision, confirmed: true })
      .expect(400);
    await http()
      .post(`/api/v1/campaigns/${campaignId}/sessions/${sessionId}/start`)
      .expect(409);
    expect(
      await db.db
        .select()
        .from(g.characters)
        .where(eq(g.characters.campaignId, campaignId)),
    ).toEqual([partial]);

    await db.db.insert(g.characters).values({
      campaignId,
      name: 'Companheiro ainda desconhecido',
      people: 'Humano',
      kind: 'COMPANION',
      background: 'Origem privada',
      level: 1,
    });
    const { body: projected } = await http().get(setup).expect(200);
    expect(JSON.stringify(projected)).not.toMatch(
      /Companheiro ainda desconhecido|Origem privada/,
    );
  });

  it('opens the library instance once and starts the guided session with a solo party', async () => {
    const library = '/api/v1/campaigns/library';
    const first = await http().get(library).expect(200);
    expect(first.body).toMatchObject({
      title: 'The Mistress of Gloamhale Manor',
      system: 'Blue Rose',
      genre: 'Fantasia e Mistério',
      narrator: 'Una',
      levels: [1, 4],
      session: { title: 'Sessão I — Os desaparecimentos de Lakesheart' },
    });
    expect(first.body.sessions).toEqual([
      {
        number: 1,
        title: 'Sessão I — Os desaparecimentos de Lakesheart',
        status: 'AVAILABLE',
      },
      ...['II', 'III', 'IV', 'V', 'VI', 'VII'].map((roman, index) => ({
        number: index + 2,
        title: `Sessão ${roman}`,
        status: 'LOCKED',
      })),
    ]);
    const copies = await Promise.all([
      http().post(library).expect(200),
      http().post(library).expect(200),
    ]);
    const { campaignId, session } = copies[0]!.body;
    expect(copies[1]!.body.campaignId).toBe(campaignId);
    const instance = await loadAdventure(campaignId, db.db);
    expect(instance?.planning?.definitionId).toBe(
      instance?.instance.definitionId,
    );
    expect(
      instance?.planning?.sessions.map((entry) => entry.objectives.length),
    ).toEqual([2, 2, 2, 2, 2, 2, 2]);
    expect(
      instance?.planning?.sessions
        .filter((entry) => entry.operational)
        .map((entry) => entry.number),
    ).toEqual([1]);

    const base = `/api/v1/campaigns/${campaignId}`;
    const preparation = `${base}/preparation`;
    const play = `${base}/sessions/${session.id}`;
    const draft = (await http().post(preparation).expect(200)).body.adventure;
    expect(draft.sheets.map((sheet: { name: string }) => sheet.name)).toEqual([
      'Naelis',
    ]);
    expect(draft.companions.map((sheet: { key: string }) => sheet.key)).toEqual(
      ['aren', 'mira', 'lys'],
    );
    expect(JSON.stringify(draft.companions)).not.toMatch(
      /abilities|privateNotes|incidente da passagem/,
    );
    await http().post(`${play}/start`).expect(409);
    await http()
      .post(`${preparation}/confirm`)
      .send({ revision: draft.revision, confirmed: true, companions: [] })
      .expect(200);
    await Promise.all([
      http().post(`${play}/start`).expect(200),
      http().post(`${play}/start`).expect(200),
    ]);
    const context = await app
      .get(NarrativeContextService)
      .build(campaignId, session.id);
    expect(context.characters.map((character) => character.name)).toEqual([
      'Naelis',
    ]);
    expect(
      (await http().get(`${play}/messages`).expect(200)).body.data,
    ).toHaveLength(1);
    expect((await http().get(library).expect(200)).body.session.status).toBe(
      'IN_PROGRESS',
    );
    expect(JSON.stringify(context)).not.toMatch(
      /Aren Valdren|Mira Selwyn|Lys Varen/,
    );
    const state = async () =>
      (await http().get(`${play}/narrative-state`).expect(200)).body;
    expect((await state()).progress).toBe(0);
    const initial = (await http().get(`${play}/messages`).expect(200)).body
      .data[0];
    expect(initial.content).toBe(
      travelOpening.replace('{{nome_da_personagem}}', 'Naelis'),
    );
    expect(initial.content).not.toMatch(/carroça|Aren|Mira|Lys|\{\{/);
    const mounts = (await state()).mounts;
    expect(mounts).toMatchObject([
      {
        name: 'Cavalo de Naelis',
        health: 45,
        maxHealth: 45,
        mounted: true,
        stats: { defense: 10, speed: 18, armor: 0 },
      },
    ]);
    const queued = [
      {
        id: randomUUID(),
        interactionMode: 'THINK',
        content: 'Pensamento exclusivo, sem testemunhas.',
      },
      {
        id: randomUUID(),
        interactionMode: 'REQUEST_CHECK',
        content: 'Gostaria de testar Percepção.',
      },
      {
        id: randomUUID(),
        interactionMode: 'ROLL_RESULT',
        content: 'Rolei 4, 4 e 2. O Dado de Drama foi 2.',
      },
    ];
    const calls = turn.mock.calls.length;
    for (const input of [...queued, queued[0]!])
      await http().post(`${play}/messages/queue`).send(input).expect(201);
    expect(turn.mock.calls.length).toBe(calls);
    const beforeContinue = (await http().get(`${play}/messages`).expect(200))
      .body.data;
    expect(
      beforeContinue.slice(1).map((message: { id: string }) => message.id),
    ).toEqual(queued.map((message) => message.id));
    const batch = { id: randomUUID() };
    await Promise.all([
      http().post(`${play}/continue`).send(batch).expect(200),
      http().post(`${play}/continue`).send(batch).expect(200),
    ]);
    await http().post(`${play}/continue`).send(batch).expect(200);
    const groupedHistory = (await http().get(`${play}/messages`).expect(200))
      .body.data;
    expect(groupedHistory).toHaveLength(5);
    expect(groupedHistory.at(-1)).toMatchObject({
      role: 'GAME_MASTER',
      metadata: { batchContinuation: true, clarification: true },
    });
    const laterContext = await app
      .get(NarrativeContextService)
      .build(campaignId, session.id);
    expect(JSON.stringify(laterContext)).not.toContain(queued[0]!.content);
    expect((await state()).progress).toBe(0);
    await local(
      campaignId,
      {
        type: 'MOUNT_DAMAGE',
        characterId: mounts[0].id,
        damage: 7,
        reason: 'Dano confirmado na fixture de montaria.',
      },
      session.id,
    );
    expect((await state()).mounts[0].health).toBe(38);
    await local(
      campaignId,
      {
        type: 'CONDITION_APPLY',
        characterId: mounts[0].id,
        name: 'Condição confirmada na fixture',
        description: 'Condição de teste',
        visibility: 'PUBLIC',
        reason: 'Registrar a condição autorizada da montaria.',
      },
      session.id,
    );
    expect((await state()).mounts[0].conditions).toEqual([
      { name: 'Condição confirmada na fixture' },
    ]);

    const cure = await local(
      campaignId,
      {
        type: 'ARCANA_CURE_PREPARE',
        characterId: (await loadAdventure(campaignId, db.db))!.instance
          .protagonistId!,
        targetId: mounts[0].id,
        visibility: 'PUBLIC',
        touchConfirmed: true,
        reason: 'Toque e cura autorizados na fixture de montaria.',
      },
      session.id,
    );
    await local(
      campaignId,
      { type: 'ARCANA_CURE_RESOLVE', requestId: cure.id },
      session.id,
    );
    expect((await state()).mounts[0].health).toBeGreaterThan(38);
    await local(
      campaignId,
      {
        type: 'MOUNT_DAMAGE',
        characterId: mounts[0].id,
        damage: 45,
        reason: 'Dano letal confirmado na fixture de montaria.',
      },
      session.id,
    );
    expect((await state()).mounts[0]).toMatchObject({
      health: 0,
      lifeState: 'DEAD',
      mounted: false,
    });

    expect(
      (await state()).availableOptions.some((option: { intent: string }) =>
        option.intent.includes('pântano'),
      ),
    ).toBe(false);
    await http()
      .post(`${play}/finalize`)
      .send({ endingType: 'OBJECTIVE_COMPLETED' })
      .expect(409);
    await http()
      .post(`${play}/continue`)
      .send({ id: randomUUID() })
      .expect(200);
    await http()
      .post(`${play}/continue`)
      .send({ id: randomUUID() })
      .expect(200);
    const travel = (await http().get(`${play}/messages`).expect(200)).body.data;
    expect(
      travel.filter(
        (message: { metadata?: { travelRevealed?: boolean } }) =>
          message.metadata?.travelRevealed,
      ),
    ).toHaveLength(1);
    const [storedPlan] = await db.db
      .select()
      .from(sessionPlans)
      .where(eq(sessionPlans.sessionId, session.id));
    const basic = {
      ...storedPlan!.plan.options[0]!,
      id: randomUUID(),
      mode: 'ACT' as const,
      intent: 'Testar Percepção',
      keywords: ['testar percepção'],
      check: {
        ability: 'PERCEPTION' as const,
        targetNumber: 12,
        focusId: null,
        secret: false,
      },
      successText: 'Resultado autorizado da fixture de Percepção.',
      failureText: 'A tentativa da fixture falhou.',
      witnesses: [],
    };
    await db.db
      .update(sessionPlans)
      .set({
        plan: {
          ...storedPlan!.plan,
          options: [...storedPlan!.plan.options, basic],
        },
      })
      .where(eq(sessionPlans.sessionId, session.id));
    const queue = (interactionMode: string, content: string) =>
      http()
        .post(`${play}/messages/queue`)
        .send({ id: randomUUID(), interactionMode, content })
        .expect(201);
    const nextBatch = () =>
      http().post(`${play}/continue`).send({ id: randomUUID() }).expect(200);
    await queue('REQUEST_CHECK', 'Testar Percepção');
    await queue('THINK', 'O teste vem antes deste pensamento.');
    const waiting = (await nextBatch()).body.action;
    expect(waiting.status).toBe('AWAITING_ROLL');
    expect((await nextBatch()).body.action.status).toBe('AWAITING_ROLL');
    await queue('ROLL_RESULT', 'Rolei 4, 4 e 2. O Dado de Drama foi 2.');
    expect((await nextBatch()).body.action.status).toBe('COMPLETED');
    const [declared] = await db.db
      .select()
      .from(g.diceRolls)
      .where(eq(g.diceRolls.requestId, waiting.pendingRoll.requestId));
    expect(declared).toMatchObject({
      die1: 4,
      die2: 4,
      dramaDie: 2,
      total: 14,
      success: true,
    });
    expect((await state()).progress).toBe(0);
    const ready = await local(
      campaignId,
      {
        type: 'CHECK_PREPARE',
        characterId: (await loadAdventure(campaignId, db.db))!.instance
          .protagonistId!,
        ability: 'PERCEPTION',
        targetNumber: 14,
        modifier: 0,
        reason: 'Teste visível autorizado pela fixture.',
        visibility: 'PUBLIC',
        stuntsEligible: true,
      },
      session.id,
    );
    await queue('ROLL_RESULT', 'Rolei 4, 4 e 2. O Dado de Drama foi 2.');
    expect((await nextBatch()).body.action.status).toBe('COMPLETED');
    const [standalone] = await db.db
      .select()
      .from(g.diceRolls)
      .where(eq(g.diceRolls.requestId, ready.id));
    expect(standalone).toMatchObject({
      total: 14,
      success: true,
      stuntPoints: 2,
    });
    await queue('SPEAK', 'O que aconteceu?');
    const interruptedBatch = { id: randomUUID() };
    turn.mockRejectedValueOnce(new Error('Falha simulada na publicação'));
    const interrupted = await http()
      .post(`${play}/continue`)
      .send(interruptedBatch)
      .expect(200);
    expect(interrupted.body.action.status).toBe('COMMITTED');
    const recovered = await http()
      .post(`${play}/continue`)
      .send(interruptedBatch)
      .expect(200);
    expect(recovered.body.action.status).toBe('COMPLETED');
    await http().post(`${play}/continue`).send(interruptedBatch).expect(200);
    expect((await state()).progress).toBe(45);
    await http()
      .post(`${play}/actions`)
      .send({
        actionId: randomUUID(),
        interactionMode: 'ACT',
        content: 'Observo ao redor.',
      })
      .expect(201);
    expect((await state()).progress).toBe(45);
    await http().post(`${play}/pause`).expect(200);
    expect((await state()).progress).toBe(45);
    await http().post(`${play}/resume`).expect(200);
    expect((await state()).progress).toBe(45);
    expect(JSON.stringify(context)).not.toMatch(
      /Evidências do sanatório|Tragédia de Gloamhale|epílogo/i,
    );
    const direct = (await state()).availableOptions.find(
      (option: { intent: string }) =>
        option.intent === 'Seguir diretamente ao pântano',
    );
    expect(direct).toBeDefined();
    await http()
      .post(`${play}/actions`)
      .send({
        actionId: randomUUID(),
        interactionMode: 'ACT',
        content: 'Não quero seguir diretamente ao pântano.',
        optionId: direct.id,
      })
      .expect(400);
    expect((await state()).progress).toBe(45);

    await http()
      .post(`${play}/actions`)
      .send({
        actionId: randomUUID(),
        interactionMode: 'ACT',
        content: 'Escolho seguir diretamente ao pântano.',
        optionId: direct.id,
      })
      .expect(201);
    const events = await db.db
      .select()
      .from(g.gameEvents)
      .where(eq(g.gameEvents.sessionId, session.id));
    const fact = events.find(
      (event) =>
        event.type === 'NARRATIVE_FACT_CONFIRMED' &&
        event.changes?.factKey === 'village-route',
    );
    expect(fact).toMatchObject({
      visibility: 'GM_ONLY',
      changes: {
        evidenceEventIds: expect.arrayContaining(
          events
            .filter(
              (event) =>
                event.type === 'CONSEQUENCE_RECORDED' &&
                !event.description.includes('fixture'),
            )
            .map((event) => event.id),
        ),
      },
    });
    expect((await state()).progress).toBe(90);
    await http()
      .post(`${play}/finalize`)
      .send({ endingType: 'OBJECTIVE_COMPLETED' })
      .expect(200);
    expect((await state()).progress).toBe(100);
    expect((await state()).outcome).toBe('COMPLETED');
    await http()
      .post(`${play}/finalize`)
      .send({ endingType: 'OBJECTIVE_COMPLETED' })
      .expect(200);
    const endings = await db.db
      .select()
      .from(g.gameEvents)
      .where(eq(g.gameEvents.sessionId, session.id));
    expect(
      endings.filter((event) => event.type === 'NARRATIVE_UNIT_COMPLETED'),
    ).toHaveLength(1);
    expect(
      endings
        .filter((event) => event.type === 'ADVENTURE_SPATIAL_STATE')
        .map((event) => event.changes.arrival),
    ).toEqual(['road']);
    expect(
      endings
        .filter((event) => event.type === 'NARRATIVE_FACT_CONFIRMED')
        .map((event) => event.changes.factKey),
    ).toEqual(['village-route']);
    for (let number = 2; number <= 7; number++) {
      const id = adventureEntityId(
        campaignId,
        `session-${number}`,
        legacyEntityNamespace,
      );
      await http().get(`${base}/sessions/${id}`).expect(404);
      const attempt = await http().post(`${base}/sessions/${id}/start`);
      expect([404, 409]).toContain(attempt.status);
    }
    expect(
      (await http().get(library).expect(200)).body.sessions
        .slice(1)
        .every((entry: { status: string }) => entry.status === 'LOCKED'),
    ).toBe(true);
    expect((await http().get(base).expect(200)).body.sessions).toHaveLength(1);
  });

  it('credits an attested consequence after a failed check and retreat, preserving terminal withdrawal', async () => {
    const registry = app.get(AdventureRegistry);
    const originalLibrary = registry.library();
    const originalRelease = registry.guidedRelease.bind(registry);
    const campaignId = randomUUID();
    const release = { ...originalLibrary.release, campaignId };
    const librarySpy = jest.spyOn(registry, 'library').mockReturnValue({
      release,
      module: { ...originalLibrary.module, guidedRelease: release },
    });
    const releaseSpy = jest
      .spyOn(registry, 'guidedRelease')
      .mockImplementation(async (id, reader) =>
        id === campaignId ? release : originalRelease(id, reader),
      );
    try {
      const {
        body: { session },
      } = await http().post('/api/v1/campaigns/library').expect(200);
      const base = `/api/v1/campaigns/${campaignId}`;
      const play = `${base}/sessions/${session.id}`;
      const {
        body: { adventure: draft },
      } = await http().post(`${base}/preparation`).expect(200);
      await http()
        .post(`${base}/preparation/confirm`)
        .send({
          revision: draft.revision,
          confirmed: true,
          companions: [],
        })
        .expect(200);
      await http().post(`${play}/start`).expect(200);
      const state = async () =>
        (await http().get(`${play}/narrative-state`).expect(200)).body;
      const [instance] = await db.db
        .select()
        .from(a.adventureInstances)
        .where(eq(a.adventureInstances.campaignId, campaignId));
      const protagonist = instance!.protagonistId!;
      const check = await local(
        campaignId,
        {
          type: 'CHECK_PREPARE',
          characterId: protagonist,
          ability: 'PERCEPTION',
          targetNumber: 99,
          visibility: 'PUBLIC',
          reason: 'Teste descartável de percepção na estrada.',
        },
        session.id,
      );
      await local(
        campaignId,
        { type: 'CHECK_RESOLVE', requestId: check.id },
        session.id,
      );
      const [roll] = await db.db
        .select()
        .from(g.diceRolls)
        .where(eq(g.diceRolls.sessionId, session.id));
      expect(roll?.success).toBe(false);
      const events = await db.db
        .select()
        .from(g.gameEvents)
        .where(eq(g.gameEvents.sessionId, session.id));
      const attempt = events.find((event) => event.type === 'ABILITY_CHECK')!;
      const attest = (factKey: string, evidenceEventIds: string[]) =>
        command(campaignId, {
          operation: 'CONFIRM_FACT',
          sessionId: session.id,
          factKey,
          evidenceEventIds,
          reason: 'Adjudicação explícita do operador na fixture de integração.',
        });
      await expect(attest('intro-contact', [attempt.id])).rejects.toThrow();
      expect((await state()).progress).toBe(0);
      await http()
        .post(`${play}/actions`)
        .send({
          actionId: randomUUID(),
          interactionMode: 'ACT',
          content: 'Recuo e abandono definitivamente a investigação.',
        })
        .expect(201);
      expect((await state()).suggestSessionEnding).toBe(false);

      const contact = await local(
        campaignId,
        {
          type: 'EVENT_RECORD',
          eventType: 'SPEECH_RECORDED',
          description:
            'Fixture de ateste: o contato com o pedido de ajuda foi confirmado.',
          participants: [protagonist],
          visibility: 'PUBLIC',
        },
        session.id,
      );
      await attest('intro-contact', [contact.id]);
      expect((await state()).progress).toBe(45);
      const retreat = await local(
        campaignId,
        {
          type: 'EVENT_RECORD',
          eventType: 'CONSEQUENCE_RECORDED',
          description:
            'Fixture de ateste: o recuo encerrou o confronto e o problema continua em aberto.',
          participants: [protagonist],
          visibility: 'PUBLIC',
        },
        session.id,
      );
      await attest('intro-response', [attempt.id, retreat.id]);
      await attest('intro-response', [attempt.id, retreat.id]);
      expect((await state()).progress).toBe(90);
      await attest('withdraw-village', [retreat.id]);
      await http()
        .post(`${play}/finalize`)
        .send({ endingType: 'OBJECTIVE_COMPLETED' })
        .expect(200);
      expect(await state()).toMatchObject({
        outcome: 'WITHDRAWN',
        progress: 90,
      });
      expect((await http().get(base).expect(200)).body.status).toBe(
        'COMPLETED',
      );
    } finally {
      releaseSpy.mockRestore();
      librarySpy.mockRestore();
    }
  });

  it('v5 traverses the canonical manor, persists visits and requires authorized passage conditions', async () => {
    const c = await insideManor(5);
    const base = `/api/v1/campaigns/${c.campaignId}/sessions/${c.sessionId}`;
    const snapshot = () =>
      app.get(NarrativeContextService).build(c.campaignId, c.sessionId);
    const location = async () =>
      (await snapshot()).adventure?.navigation?.locationId;
    const at = (key: string) =>
      expect(location()).resolves.toBe(
        adventureEntityId(c.campaignId, key, legacyEntityNamespace),
      );
    const send = (
      content: string,
      optionId?: string,
      actionId = randomUUID(),
      interactionMode = 'ACT',
    ) =>
      http()
        .post(`${base}/actions`)
        .send({
          actionId,
          interactionMode,
          content,
          ...(optionId ? { optionId } : {}),
        })
        .expect(201);
    const move = async (text: string, key: string, optionId?: string) => {
      expect((await send(text, optionId)).body.status).toBe('COMPLETED');
      await at(key);
    };
    const confirm = (passage: string) =>
      command(c.campaignId, {
        operation: 'CONFIRM_PASSAGE',
        sessionId: c.sessionId,
        passage,
        open: true,
        confirmedInPlay: true,
        reason: 'Condição canônica confirmada na fixture local.',
      });
    await at('manor');
    await move('Quero subir a escada.', 'manor');
    await move('Vou para a adega.', 'manor');
    turn.mockImplementation(async (input) => ({
      proposal:
        input.stage === 'PROPOSE'
          ? { kind: 'SCENE', optionId: input.context.navigation.exits[0].id }
          : null,
      narration: input.stage === 'NARRATE' ? input.confirmed : null,
      usage: [],
      error: null,
    }));
    const forged = await send('Observo a poeira.');
    expect(forged.body.status).not.toBe('COMPLETED');
    await at('manor');
    await http()
      .post(`${base}/actions/${forged.body.id}/cancel`)
      .send({})
      .expect(200);
    turn.mockImplementation(async (input) => ({
      proposal: input.stage === 'PROPOSE' ? { kind: 'OBSERVE' } : null,
      narration: input.stage === 'NARRATE' ? input.confirmed : null,
      usage: [],
      error: null,
    }));
    await confirm('main-stairs');
    await move('Quero subir a escada.', 'upstairs');
    expect((await snapshot()).options).toEqual([]);
    await move('Entro pela porta barricada.', 'upstairs');
    await confirm('barricade');
    await move('Vou para o quarto da senhora.', 'mistress-bedroom');
    expect(JSON.stringify((await snapshot()).selection)).not.toMatch(
      /espelho reflete|Erila Qinrel/,
    );
    await move('Volto para a sala anterior.', 'upstairs');
    await move('Vou para a escada do sótão.', 'attic-stairs');
    await move('Vou para o sótão.', 'attic-stairs');
    await confirm('attic-ascent');
    await move('Vou para o sótão.', 'attic');
    expect((await snapshot()).actors.map((a) => a.name)).not.toEqual(
      expect.arrayContaining(['Eric', 'Bamala']),
    );
    await move('Volto para a sala anterior.', 'attic-stairs');
    await move('Vou para o sótão.', 'attic-stairs');
    await move('Vou para o corredor superior.', 'upstairs');
    await move('Vou para o vestíbulo.', 'manor');
    await move('Vou para a sala de música.', 'drawing-room');
    await move('Vou para a estufa.', 'conservatory');
    await expect(confirm('buried-door')).rejects.toThrow('eligible passage');
    await move('Entro pela porta externa soterrada.', 'conservatory');
    await move('Vou para o porão.', 'cellar');
    await move('Vou para a adega.', 'wine-cellar');
    expect((await snapshot()).adventure?.gm?.encounter).toBeUndefined();
    await db.db.insert(g.worldEntities).values(
      Array.from({ length: 24 }, (_, i) => ({
        campaignId: c.campaignId,
        kind: 'OBJECT' as const,
        name: `Objeto distante ${i}`,
        description: 'Não pertence à adega.',
        status: 'INITIAL',
        accessible: true,
        visibility: 'PUBLIC' as const,
      })),
    );
    expect((await snapshot()).world.map((w) => w.name)).toEqual([
      'Wine Cellar',
    ]);
    await command(c.campaignId, {
      operation: 'GLOAMHALE_TIME',
      sessionId: c.sessionId,
      minutes: 1,
      reason: 'O relógio especial continua funcionando sem encontro preparado.',
    });
    const kitchen = (await snapshot()).adventure?.navigation?.exits.find(
      (e) => e.kind === 'TRAPDOOR',
    );
    expect(kitchen?.status).toBe('OPEN');
    const actionId = randomUUID();
    await send(kitchen!.label, kitchen!.id, actionId);
    await send(kitchen!.label, kitchen!.id, actionId);
    await at('kitchen');
    expect((await snapshot()).adventure?.navigation?.visits).toBe(1);
    await move('Vou para a sala de jantar.', 'dining-room');
    await command(c.campaignId, {
      operation: 'SCENE',
      sessionId: c.sessionId,
      sceneKey: 'feast',
      reason: 'O encontro foi preparado explicitamente pela fixture.',
    });
    await command(c.campaignId, {
      operation: 'CONFIRM_REVELATION',
      sessionId: c.sessionId,
      revelation: 'feast-dispelled',
      confirmedInPlay: true,
      reason: 'A ilusão foi dissipada na adjudicação de teste.',
    });
    await command(c.campaignId, {
      operation: 'CONFIRM_PASSAGE',
      sessionId: c.sessionId,
      passage: 'service-door',
      open: false,
      confirmedInPlay: true,
      reason: 'A porta de serviço foi bloqueada no teste.',
    });
    await move('Vou para o vestíbulo.', 'manor');
    await move('Volto para a sala anterior.', 'dining-room');
    await move('Vou para a cozinha.', 'dining-room');
    expect((await snapshot()).scene).toContain('Mofo');
    expect((await snapshot()).adventure?.gm?.encounter).toBeUndefined();
    await http().post(`${base}/pause`).send({}).expect(200);
    await http().post(`${base}/resume`).send({}).expect(200);
    await at('dining-room');
    await move('Vou para o vestíbulo.', 'manor');
    expect((await snapshot()).adventure?.navigation?.visits).toBeGreaterThan(1);
    await move('Saio da mansão.', 'grounds');
    await move('Vou para a gruta.', 'grounds');
    await confirm('grotto-path');
    await move('Vou para a gruta.', 'grotto');
    expect(
      (await snapshot()).actors.some((a) => a.name.includes('Chant')),
    ).toBe(false);
  });

  it('v4 persists Chant absence, rejects stale mentions, and enables dialogue after finding her', async () => {
    const c = await prepared(4);
    const base = `/api/v1/campaigns/${c.campaignId}/sessions/${c.sessionId}`;
    const scene = (sceneKey: string) =>
      command(c.campaignId, {
        operation: 'SCENE',
        sessionId: c.sessionId,
        sceneKey,
        reason: 'Preparação local da cena em teste.',
      });
    const snapshot = () =>
      app.get(NarrativeContextService).build(c.campaignId, c.sessionId);
    await http().post(`${base}/start`).send({}).expect(200);
    await scene('chant-talk');
    const chant = (await snapshot()).actors.find((actor) =>
      actor.name.includes('Chant'),
    )!;
    expect(chant.available).toBe(true);
    await scene('losing-chant');
    const talk = {
      kind: 'FREE',
      intent: 'TALK',
      expression: 'DIRECT',
      description: 'Tento falar com Chant.',
      target: { type: 'CHARACTER', name: chant.name },
      tool: { type: 'DIALOGUE' },
    };
    const inject = (text: string) =>
      turn.mockImplementation(async (input) => ({
        proposal: input.stage === 'PROPOSE' ? talk : null,
        narration:
          input.stage === 'NARRATE'
            ? {
                ...input.confirmed,
                narrative: text,
                beats: [
                  { kind: 'ATMOSPHERE', speakerId: null, factIds: [], text },
                ],
              }
            : null,
        usage: [],
        error: null,
      }));
    inject('Jaymes matou Erila.');
    await http()
      .post(`${base}/actions`)
      .send({
        actionId: randomUUID(),
        interactionMode: 'SPEAK',
        content: `@${chant.name}`,
        mentions: [
          {
            type: 'CHARACTER',
            entityId: chant.id,
            label: chant.name,
            literal: `@${chant.name}`,
            start: 0,
            end: chant.name.length + 1,
          },
        ],
      })
      .expect(201);
    const [action] = await db.db
      .select()
      .from(g.gameEvents)
      .where(eq(g.gameEvents.campaignId, c.campaignId))
      .then((events) => events.filter((e) => e.type === 'NPC_REPLY_RECORDED'));
    expect(action).toBeUndefined();
    expect(
      turn.mock.calls.find(([input]) => input.stage === 'PROPOSE')?.[0].context
        .actors,
    ).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: chant.id })]),
    );
    await scene('chant-talk');
    expect((await snapshot()).actors.some((a) => a.id === chant.id)).toBe(
      false,
    );
    const provenance = {
      authorId: 'audit',
      source: 'Fixture de presença',
      reviewed: true,
    };
    await command(c.campaignId, {
      operation: 'SCENE',
      sessionId: c.sessionId,
      sceneKey: 'grotto',
      reason: 'Gruta com vínculo editorial autorizado na fixture.',
      storyCardDialogue: {
        bindingVersion: 1,
        campaignId: c.campaignId,
        definitionId: 'six-of-swords-gloamhale:v4',
        definitionDigest: digest(gloamhaleV4),
        entityNamespace: 'gloamhale',
        sceneKey: 'grotto',
        provenance,
        bindings: [
          {
            characterKey: 'chant',
            entityId: chant.id,
            libraryId: 'khaos-dialogue',
            contentVersion: 1,
            voiceId: 'RESERVED',
            expectedState: 'Sem alterações confirmadas.',
            choices: [{ topic: 'conversation', act: 'ANSWER' }],
            sources: [],
            provenance,
          },
        ],
      },
    });
    const confirm = (revelation: string) =>
      command(c.campaignId, {
        operation: 'CONFIRM_REVELATION',
        sessionId: c.sessionId,
        revelation,
        confirmedInPlay: true,
        reason: 'A descoberta ocorreu nesta cena da fixture.',
      });
    expect((await snapshot()).actors.some((a) => a.id === chant.id)).toBe(
      false,
    );
    expect((await snapshot()).dialogue).toBeUndefined();
    await confirm('chant-found');
    expect(
      (await snapshot()).dialogue?.some((d) => d.characterId === chant.id),
    ).toBe(true);
    expect((await snapshot()).actors.some((a) => a.id === chant.id)).toBe(true);
    for (const text of [
      'Jaymes matou Erila.',
      'Atrás da estante há uma galeria que conduz ao jardim.',
    ]) {
      inject(text);
      const response = await http()
        .post(`${base}/actions`)
        .send({
          actionId: randomUUID(),
          interactionMode: 'SPEAK',
          content: 'Chant, você está bem?',
        })
        .expect(201);
      expect(response.body.status).toBe('COMPLETED');
      expect(turn.mock.calls.at(-1)?.[0].stage).toBe('NARRATE');
      const history = JSON.stringify(
        (await http().get(`${base}/messages`)).body,
      );
      expect(history).not.toContain(text);
      expect(history).toContain('UNAPPROVED_SEGMENT');
    }
    await scene('foiled-trap');
    await scene('grotto');
    expect((await snapshot()).actors.some((a) => a.id === chant.id)).toBe(true);
    expect(
      (await snapshot()).selection.information.some(
        (f) => f.scope === 'KNOWN' && f.text.includes('encontrada na gruta'),
      ),
    ).toBe(true);
    await http().post(`${base}/pause`).send({}).expect(200);
    await http().post(`${base}/resume`).send({}).expect(200);
    const restarted = await snapshot();
    expect(restarted.actors.some((a) => a.id === chant.id)).toBe(true);
    expect(
      restarted.selection.information.some(
        (f) => f.scope === 'KNOWN' && f.text.includes('encontrada na gruta'),
      ),
    ).toBe(true);
  });

  it('v4 discloses only scene-confirmed facts and keeps private identities out of the model', async () => {
    const c = await prepared(4);
    const base = `/api/v1/campaigns/${c.campaignId}/sessions/${c.sessionId}`;
    const snapshot = () =>
      app.get(NarrativeContextService).build(c.campaignId, c.sessionId);
    const scene = (sceneKey: string) =>
      command(c.campaignId, {
        operation: 'SCENE',
        sessionId: c.sessionId,
        sceneKey,
        reason: 'Preparação local da cena em teste.',
      });
    const confirm = (revelation: string) =>
      command(c.campaignId, {
        operation: 'CONFIRM_REVELATION',
        sessionId: c.sessionId,
        revelation,
        confirmedInPlay: true,
        reason: 'A descoberta ocorreu nesta cena da fixture.',
      });
    await http().post(`${base}/start`).send({}).expect(200);
    const sceneOption = adventureEntityId(
      c.campaignId,
      'option-foiled-trap-ask-villagers',
      legacyEntityNamespace,
    );
    await http()
      .post(`${base}/actions`)
      .send({
        actionId: randomUUID(),
        interactionMode: 'SPEAK',
        optionId: sceneOption,
        content: 'Pergunto aos moradores o que houve.',
      })
      .expect(201);
    const selected = turn.mock.calls.find(
      ([input]) => input.context.selectedOptionId === sceneOption,
    )?.[0];
    expect(selected.context.adventure).toEqual({
      gm: { localAdjudicationRequired: false },
    });
    await expect(confirm('study-sanatorium')).rejects.toThrow('source scene');
    await scene('study');
    expect(JSON.stringify((await snapshot()).selection)).not.toMatch(
      /ilusão|Sanatório Gloamhale/,
    );
    await expect(
      local(
        c.campaignId,
        {
          type: 'WORLD_UPSERT',
          kind: 'LOCATION',
          entityId: adventureEntityId(
            c.campaignId,
            'study',
            legacyEntityNamespace,
          ),
          name: 'Study',
          description: 'O escritório é uma ilusão.',
          status: 'INITIAL',
          accessible: true,
          visibility: 'PUBLIC',
          privateNotes: '',
          reason: 'Injeção proibida no catálogo.',
        },
        c.sessionId,
      ),
    ).rejects.toThrow('require adventure confirmation');
    await confirm('study-sanatorium');
    expect(
      (await snapshot()).selection.information.some(
        (f) => f.scope === 'KNOWN' && f.text.includes('selo do Sanatório'),
      ),
    ).toBe(true);
    await scene('feast');
    expect((await snapshot()).scene).toContain('pratos fumegantes');
    await confirm('feast-dispelled');
    await scene('study');
    await scene('feast');
    expect((await snapshot()).scene).toContain('Mofo e teias');
    expect(JSON.stringify((await snapshot()).selection)).not.toContain(
      'pratos fumegantes',
    );
    await scene('erila');
    const before = await snapshot();
    expect(
      JSON.stringify({ actors: before.actors, selection: before.selection }),
    ).not.toMatch(/Erila|espelho reflete/);
    await confirm('mirror-examined');
    expect(JSON.stringify((await snapshot()).selection)).toContain(
      'espelho reflete',
    );
    expect(
      (await snapshot()).actors.some((a) => a.name === 'Erila Qinrel'),
    ).toBe(false);
    await confirm('erila-identified');
    expect(
      (await snapshot()).actors.some((a) => a.name === 'Erila Qinrel'),
    ).toBe(true);
    expect(JSON.stringify((await snapshot()).selection)).not.toContain(
      'Jaymes a matou',
    );
    await scene('attic');
    expect((await snapshot()).actors.map((a) => a.name)).not.toEqual(
      expect.arrayContaining(['Eric', 'Bamala']),
    );
    await confirm('eric-identified');
    expect((await snapshot()).actors.map((a) => a.name)).toContain('Eric');
    expect((await snapshot()).actors.map((a) => a.name)).not.toContain(
      'Bamala',
    );
    await confirm('bamala-identified');
    await command(c.campaignId, {
      operation: 'CONFIRM_CAST_PRESENCE',
      sessionId: c.sessionId,
      characterKey: 'bamala',
      present: true,
      canSpeak: false,
      confirmedInPlay: true,
      reason: 'A criança está presente mas indisponível para conversa.',
    });
    expect(
      (await snapshot()).adventure?.cast?.find(
        (x) => x.identity?.key === 'bamala',
      )?.canSpeak,
    ).toBe(false);
    expect((await snapshot()).actors.map((a) => a.name)).not.toContain(
      'Bamala',
    );
  });

  it('executes a selected ritual task and its hazard atomically through the Master, without raw modifiers', async () => {
    const c = await insideManor();
    await command(c.campaignId, {
      operation: 'SCENE',
      sessionId: c.sessionId,
      sceneKey: 'ritual',
      reason: 'Poema e preparação conferidos nesta fixture de ritual.',
    });
    await command(c.campaignId, {
      operation: 'GLOAMHALE_RITUAL_BEGIN',
      sessionId: c.sessionId,
      eggEaters: [],
      dispelledHaints: false,
      hazardProtection: 'NONE',
      reason: 'Política do perigo preparada explicitamente antes do jogo.',
    });
    const base = `/api/v1/campaigns/${c.campaignId}/sessions/${c.sessionId}`;
    const state = (await http().get(`${base}/narrative-state`).expect(200))
      .body;
    const selected = state.availableMechanics.find(
      (o: { command: { type: string; input?: { task: string } } }) =>
        o.command.type === 'ADVENTURE_ACTION' &&
        o.command.input?.task === 'POEM',
    );
    expect(selected).toBeDefined();
    const id = randomUUID();
    expect(
      (
        await http()
          .post(`${base}/actions`)
          .send({
            actionId: id,
            interactionMode: 'ACT',
            content: 'Recito o poema e dispenso façanhas nesta tentativa.',
            mechanic: selected.command,
          })
          .expect(201)
      ).body.status,
    ).toBe('AWAITING_ROLL');
    await http().post(`${base}/actions/${id}/roll`).send({}).expect(200);
    const ritual = gloamhaleState(
      (await adventure.status(c.campaignId)).mechanics,
    )!.ritual!;
    expect(ritual).toMatchObject({
      points: 4,
      tasks: ['POEM'],
      pending: null,
      status: 'ACTIVE',
    });
    const count = random.d6.mock.calls.length;
    await http().post(`${base}/actions/${id}/roll`).send({}).expect(200);
    expect(random.d6).toHaveBeenCalledTimes(count);
    const invalid = {
      type: 'ADVENTURE_ACTION',
      input: { ...selected.command.input, modifier: 10 },
    };
    await http()
      .post(`${base}/actions`)
      .send({
        actionId: randomUUID(),
        interactionMode: 'ACT',
        content: 'Sem bônus inventado.',
        mechanic: invalid,
      })
      .expect(400);
  });
  it('runs the v2 village path without local scene preparation or objective review during play', async () => {
    const campaignId = randomUUID();
    await command(campaignId, {
      operation: 'IMPORT',
      adventureId: gloamhale.id,
      version: 2,
    });
    await command(campaignId, {
      operation: 'TRANSCRIBE_SUPPLIED_PARTY',
      confirmSourceTranscription: true,
    });
    const report = await adventure.status(campaignId);
    await command(campaignId, {
      operation: 'REVIEW_PARTY',
      expectedDigest: report.snapshotDigest,
      sourceReview: 'Fichas e limitações conferidas antes da sessão.',
      manualRulesAccepted: true,
    });
    const sessionId = adventureEntityId(
      campaignId,
      'session-1',
      legacyEntityNamespace,
    );
    const base = `/api/v1/campaigns/${campaignId}/sessions/${sessionId}`;
    await http().post(`${base}/start`).send({}).expect(200);
    for (const [scene, option, content, interactionMode] of [
      ['foiled-trap', 'ask-villagers', 'Pergunto o que aconteceu.', 'SPEAK'],
      ['foiled-trap', 'enter-village', 'Vou para Lakesheart.', 'ACT'],
      [
        'village',
        'investigate',
        'Decido investigar os desaparecimentos.',
        'ACT',
      ],
    ]) {
      const action = await http()
        .post(`${base}/actions`)
        .send({
          actionId: randomUUID(),
          interactionMode,
          content,
          optionId: adventureEntityId(
            campaignId,
            `option-${scene}-${option}`,
            legacyEntityNamespace,
          ),
        })
        .expect(201);
      expect(action.body.status).toBe('COMPLETED');
    }
    const progress = (await http().get(`${base}/narrative-state`)).body;
    expect(progress.objectiveCompleted).toBe(true);
    expect(progress.objectives[0].evidenceEventIds).toHaveLength(2);
    expect((await adventure.status(campaignId)).narrativeMinutes).toBe(10);
    await http()
      .post(`${base}/finalize`)
      .send({ endingType: 'OBJECTIVE_COMPLETED' })
      .expect(200);
  });
  it('feeds the manor clock from the generic narrative-time command without rerolling on retry', async () => {
    const c = await insideManor();
    const input = {
      campaignId: c.campaignId,
      sessionId: c.sessionId,
      commandId: randomUUID(),
      command: {
        type: 'NARRATIVE_TIME_ADVANCE',
        minutes: 120,
        reason: 'Duração narrativa confirmada de exploração, sem tempo OOC.',
      },
    };
    await engine.executeInternal(input);
    await engine.executeInternal(input);
    expect(
      gloamhaleState((await adventure.status(c.campaignId)).mechanics),
    ).toMatchObject({ stage: 1, elapsedMinutes: 120 });
    expect((await adventure.status(c.campaignId)).narrativeMinutes).toBe(120);
  });
  it('persists the manor clock, caps four changes, sends zero Health to the grotto and restores adult scores', async () => {
    const c = await insideManor();
    const original = await db.db
      .select()
      .from(g.characterAbilities)
      .where(eq(g.characterAbilities.characterId, c.pc.id))
      .orderBy(g.characterAbilities.ability);
    const advance = {
      campaignId: c.campaignId,
      sessionId: c.sessionId,
      commandId: randomUUID(),
      operation: 'GLOAMHALE_TIME',
      minutes: 600,
      reason: 'Dez horas narrativas transcorreram dentro dos terrenos.',
    };
    await adventure.execute(advance);
    await adventure.execute(advance);
    const scores = await db.db
      .select()
      .from(g.characterAbilities)
      .where(eq(g.characterAbilities.characterId, c.pc.id))
      .orderBy(g.characterAbilities.ability);
    expect(scores.find((r) => r.ability === 'COMMUNICATION')?.score).toBe(6);
    expect(scores.find((r) => r.ability === 'DEXTERITY')?.score).toBe(-1);
    expect(scores.find((r) => r.ability === 'STRENGTH')?.score).toBe(-4);
    await expect(
      local(
        c.campaignId,
        {
          type: 'RESOURCE_SET',
          characterId: c.pc.id,
          name: 'HEALTH',
          current: 0,
          maximum: 23,
          reason:
            'Não contornar a exceção de morte da mansão por correção genérica.',
        },
        c.sessionId,
      ),
    ).rejects.toThrow('GLOAMHALE_DAMAGE');
    await expect(
      local(
        c.campaignId,
        {
          type: 'ABILITY_SET',
          characterId: c.pc.id,
          ability: 'STRENGTH',
          score: 3,
          reason: 'Alteração indevida durante a transformação infantil.',
        },
        c.sessionId,
      ),
    ).rejects.toThrow('adult');
    const damage = {
      campaignId: c.campaignId,
      sessionId: c.sessionId,
      commandId: randomUUID(),
      operation: 'GLOAMHALE_DAMAGE',
      characterId: c.pc.id,
      damage: 100,
      reason: 'Dano final adjudicado de um perigo dentro da mansão.',
    };
    await adventure.execute(damage);
    await adventure.execute(damage);
    expect(
      (await http().get(`/api/v1/characters/${c.pc.id}`)).body,
    ).toMatchObject({ lifeState: 'ALIVE' });
    expect(
      gloamhaleState((await adventure.status(c.campaignId)).mechanics)
        ?.children[c.pc.id]?.location,
    ).toBe('GROTTO');
    await command(c.campaignId, {
      operation: 'GLOAMHALE_RETURN',
      sessionId: c.sessionId,
      cause: 'LEFT_LAKEBED',
      characterIds: c.cast.map((p) => p.id),
      reason: 'O grupo saiu inteiramente do leito do lago, confirmado.',
    });
    expect(
      await db.db
        .select()
        .from(g.characterAbilities)
        .where(eq(g.characterAbilities.characterId, c.pc.id))
        .orderBy(g.characterAbilities.ability),
    ).toEqual(original);
  });
  it('requires all three ritual tasks, applies each hazard once, enforces benefits and permanently prevents a restart after stopping', async () => {
    const c = await insideManor();
    await command(c.campaignId, {
      operation: 'SCENE',
      sessionId: c.sessionId,
      sceneKey: 'ritual',
      reason: 'Os versos foram reunidos e o grupo decidiu executar o ritual.',
    });
    await command(c.campaignId, {
      operation: 'GLOAMHALE_RITUAL_BEGIN',
      sessionId: c.sessionId,
      eggEaters: [c.pc.id],
      dispelledHaints: true,
      hazardProtection: 'NONE',
      reason:
        'Ovos e haints libertos confirmados; dano psíquico sem proteção de armadura, decisão local.',
    });
    const attempt = async (task: string, benefit = 'NONE') => {
      const roll = {
        campaignId: c.campaignId,
        commandId: randomUUID(),
        sessionId: c.sessionId,
        operation: 'GLOAMHALE_RITUAL_ROLL',
        characterId: c.pc.id,
        task,
        benefit,
        modifier: 0,
        reason:
          'Aplicações de talentos e relações conferidas antes desta rolagem.',
      };
      const receipt = await adventure.execute(roll);
      expect(await adventure.execute(roll)).toEqual(receipt);
      const resolve = {
        campaignId: c.campaignId,
        commandId: randomUUID(),
        sessionId: c.sessionId,
        operation: 'GLOAMHALE_RITUAL_RESOLVE',
        declineStunts: true,
        reason:
          'A jogadora dispensou as façanhas desta rolagem; resolver os efeitos básicos.',
      };
      const result = await adventure.execute(resolve);
      expect(await adventure.execute(resolve)).toEqual(result);
      return result;
    };
    for (let i = 0; i < 4; i++) await attempt('CANDLES');
    expect(
      (await adventure.status(c.campaignId)).mechanics?.ritual,
    ).toMatchObject({ points: 16, status: 'ACTIVE', threshold: 16 });
    await attempt('POEM', 'EGG');
    await expect(
      command(c.campaignId, {
        operation: 'GLOAMHALE_RITUAL_ROLL',
        sessionId: c.sessionId,
        characterId: c.pc.id,
        task: 'SHAPING',
        benefit: 'EGG',
        modifier: 0,
        reason: 'Tentativa inválida de consumir o mesmo ovo duas vezes.',
      }),
    ).rejects.toThrow('benefit');
    await command(c.campaignId, {
      operation: 'GLOAMHALE_RITUAL_STOP',
      sessionId: c.sessionId,
      reason: 'A jogadora decidiu interromper voluntariamente o ritual agora.',
    });
    await expect(
      command(c.campaignId, {
        operation: 'GLOAMHALE_RITUAL_BEGIN',
        sessionId: c.sessionId,
        eggEaters: [],
        dispelledHaints: false,
        hazardProtection: 'NONE',
        reason: 'Tentativa inválida de reiniciar um ritual interrompido.',
      }),
    ).rejects.toThrow('again');
  });
  it('commits a successful ritual and its last hazard atomically, preserving child form and requiring a decision on stunts', async () => {
    const c = await insideManor();
    await command(c.campaignId, {
      operation: 'SCENE',
      sessionId: c.sessionId,
      sceneKey: 'ritual',
      reason: 'As pistas do ritual foram verificadas e o grupo está reunido.',
    });
    await command(c.campaignId, {
      operation: 'GLOAMHALE_RITUAL_BEGIN',
      sessionId: c.sessionId,
      eggEaters: [c.pc.id],
      dispelledHaints: true,
      hazardProtection: 'NONE',
      reason:
        'Haints foram libertos e ovos antigos consumidos; proteção psíquica adjudicada sem armadura.',
    });
    const roll = (task: string, benefit = 'NONE') =>
      command(c.campaignId, {
        operation: 'GLOAMHALE_RITUAL_ROLL',
        sessionId: c.sessionId,
        characterId: c.pc.id,
        task,
        benefit,
        modifier: 0,
        reason:
          'Modificadores locais e focos pertinentes conferidos antes dos dados.',
      });
    const resolve = () =>
      command(c.campaignId, {
        operation: 'GLOAMHALE_RITUAL_RESOLVE',
        sessionId: c.sessionId,
        declineStunts: true,
        reason:
          'Decisão explícita de não gastar pontos de façanha neste teste.',
      });
    random.d6
      .mockReturnValueOnce(3)
      .mockReturnValueOnce(3)
      .mockReturnValueOnce(2);
    expect(await roll('POEM', 'EGG')).toMatchObject({
      total: 10,
      success: true,
      targetNumber: 10,
    });
    await expect(roll('CANDLES')).rejects.toThrow('pending');
    await expect(
      command(c.campaignId, {
        operation: 'GLOAMHALE_RITUAL_STOP',
        sessionId: c.sessionId,
        reason:
          'Não descartar o perigo de uma tentativa que já teve seus dados rolados.',
      }),
    ).rejects.toThrow('already rolled');
    await expect(
      local(
        c.campaignId,
        {
          type: 'REST',
          characterId: c.pc.id,
          kind: 'BREATHER',
          reason: 'Descanso indevido durante uma rolagem pendente do ritual.',
        },
        c.sessionId,
      ),
    ).rejects.toThrow('pending');
    await http()
      .post(
        `/api/v1/campaigns/${c.campaignId}/sessions/${c.sessionId}/finalize`,
      )
      .send({ endingType: 'PLAYER_REQUESTED' })
      .expect(409);
    await resolve();
    await roll('CANDLES', 'HAINT_DAMAGE');
    random.d6.mockReturnValueOnce(5).mockReturnValueOnce(6);
    expect(await resolve()).toMatchObject({ rawDamage: 11, damage: 2 });
    await expect(roll('POEM', 'HAINT_TARGET')).rejects.toThrow('benefit');
    for (let i = 0; i < 3; i++) {
      await roll('CANDLES');
      await resolve();
    }
    expect(
      (await adventure.status(c.campaignId)).mechanics?.ritual,
    ).toMatchObject({ status: 'ACTIVE', points: 18 });
    await roll('SHAPING');
    random.d6.mockReturnValueOnce(6).mockReturnValueOnce(6);
    const result = await resolve();
    expect(result).toMatchObject({
      completed: true,
      ritualStatus: 'COMPLETED',
      points: 22,
    });
    const mechanics = gloamhaleState(
      (await adventure.status(c.campaignId)).mechanics,
    )!;
    expect(mechanics.children[c.pc.id]?.location).toBe('GROTTO');
    expect(mechanics.children[c.pc.id]?.age).toBe(10);
    expect(
      (
        await db.db
          .select()
          .from(a.adventureCast)
          .where(eq(a.adventureCast.campaignId, c.campaignId))
      ).find((p) => p.key === 'jaymes')?.currentState,
    ).toContain('Banido definitivamente');
    expect(
      (
        await db.db
          .select()
          .from(g.characterResources)
          .where(eq(g.characterResources.characterId, c.pc.id))
      ).find((r) => r.name === 'HEALTH')?.current,
    ).toBe(1);
    await expect(resolve()).rejects.toThrow('active ritual');
    const context = await app
      .get(NarrativeContextService)
      .build(c.campaignId, c.sessionId);
    expect(
      gloamhaleState(context.adventure?.gm?.runtimeMechanics ?? null)?.ritual
        ?.status,
    ).toBe('COMPLETED');
    const event = (
      await db.db
        .select()
        .from(g.gameEvents)
        .where(eq(g.gameEvents.campaignId, c.campaignId))
    ).find(
      (e) =>
        e.type === 'GLOAMHALE_RITUAL_PROGRESS' && e.changes.completed === true,
    )!;
    await command(c.campaignId, {
      operation: 'REVIEW_SESSION',
      sessionId: c.sessionId,
      reason:
        'Conferidos os critérios e consequências do caminho alternativo seguido nesta sessão.',
      evidenceEventIds: [event.id],
    });
    const ended = await http()
      .post(
        `/api/v1/campaigns/${c.campaignId}/sessions/${c.sessionId}/finalize`,
      )
      .send({ endingType: 'OBJECTIVE_COMPLETED' })
      .expect(200);
    expect(ended.body.summary).toContain('banido definitivamente');
  });
  it('rejects unsupported exhaustion interaction before rolling Cure inside the manor', async () => {
    const c = await insideManor();
    await db.db
      .update(g.characterVitals)
      .set({ fatigueLevel: 3 })
      .where(eq(g.characterVitals.characterId, c.pc.id));
    const before = random.d6.mock.calls.length;
    await expect(
      local(
        c.campaignId,
        {
          type: 'ARCANA_CURE_PREPARE',
          characterId: c.pc.id,
          targetId: c.cast.find((p) => p.id !== c.pc.id)!.id,
          touchConfirmed: true,
          visibility: 'PUBLIC',
          reason: 'Testar o bloqueio explícito de exaustão dentro da mansão.',
        },
        c.sessionId,
      ),
    ).rejects.toThrow('local adjudication');
    expect(random.d6.mock.calls.length).toBe(before);
  });
  it('rolls back Health, location, messages and receipts together when the manor audit fails', async () => {
    const c = await insideManor();
    const input = {
      operation: 'GLOAMHALE_DAMAGE',
      campaignId: c.campaignId,
      sessionId: c.sessionId,
      commandId: randomUUID(),
      characterId: c.pc.id,
      damage: 100,
      reason: 'Verificar recuperação atômica de dano e transporte à gruta.',
    };
    const before = (await adventure.status(c.campaignId)).mechanics;
    await db.db.execute(
      sql`CREATE FUNCTION reject_manor_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.type = 'GLOAMHALE_LOCAL_RULING' THEN RAISE EXCEPTION 'audit failure'; END IF; RETURN NEW; END $$`,
    );
    await db.db.execute(
      sql`CREATE TRIGGER reject_manor_audit BEFORE INSERT ON game_events FOR EACH ROW EXECUTE FUNCTION reject_manor_audit()`,
    );
    try {
      await expect(adventure.execute(input)).rejects.toThrow();
    } finally {
      await db.db.execute(sql`DROP TRIGGER reject_manor_audit ON game_events`);
      await db.db.execute(sql`DROP FUNCTION reject_manor_audit()`);
    }
    expect((await adventure.status(c.campaignId)).mechanics).toEqual(before);
    expect(
      (
        await db.db
          .select()
          .from(g.characterResources)
          .where(eq(g.characterResources.characterId, c.pc.id))
      ).find((r) => r.name === 'HEALTH')?.current,
    ).toBe(23);
    expect(
      await db.db
        .select()
        .from(g.gameCommands)
        .where(eq(g.gameCommands.commandId, input.commandId)),
    ).toHaveLength(0);
    expect(
      await db.db
        .select()
        .from(g.gameEvents)
        .where(eq(g.gameEvents.commandId, input.commandId)),
    ).toHaveLength(0);
    const result = await adventure.execute(input);
    expect(result).toMatchObject({ current: 1, transported: true });
    expect(result).toMatchObject({ eventIds: [expect.any(String)] });
    expect(await adventure.execute(input)).toEqual(result);
  });
  it('imports once under repeat and concurrency; canonical cards and world remain private', async () => {
    const campaignId = randomUUID(),
      input = { operation: 'IMPORT', campaignId, commandId: randomUUID() };
    const results = await Promise.all([
      adventure.execute(input),
      adventure.execute(input),
    ]);
    expect(results[0]).toEqual(results[1]);
    await command(campaignId, { operation: 'IMPORT' });
    expect(
      await db.db
        .select()
        .from(a.adventureCast)
        .where(eq(a.adventureCast.campaignId, campaignId)),
    ).toHaveLength(gloamhale.characters.length);
    expect(
      (await http().get(`/api/v1/campaigns/${campaignId}/world-state`)).body,
    ).toEqual([]);
    expect(
      (await http().get(`/api/v1/campaigns/${campaignId}/characters`)).body,
    ).toEqual([]);
    await http()
      .get(`/api/v1/campaigns/${campaignId}/adventure-definition`)
      .expect(404);
    expect(
      (await http().get(`/api/v1/campaigns/${campaignId}/sessions`)).body.map(
        (s: { title: string }) => s.title,
      ),
    ).toEqual([1, 2, 3, 4, 5, 6].map((n) => `Sessão ${n}`));
    await expect(
      adventure.execute({
        ...input,
        operation: 'SCENE',
        sessionId: randomUUID(),
        sceneKey: 'erila',
        reason: 'Não reutilizar chave.',
      }),
    ).rejects.toThrow('different input');
  });
  it('blocks starting without a party, invalidates stale review, and preserves the supplied originals', async () => {
    const c = await imported(),
      base = `/api/v1/campaigns/${c.campaignId}/sessions/${c.sessionId}`;
    await http().post(`${base}/start`).send({}).expect(409);
    await expect(
      command(c.campaignId, {
        operation: 'REVIEW_PARTY',
        expectedDigest: '0'.repeat(64),
        sourceReview: 'Sem protagonista ou companheiros conferidos.',
        manualRulesAccepted: true,
      }),
    ).rejects.toThrow();
    await command(c.campaignId, {
      operation: 'TRANSCRIBE_SUPPLIED_PARTY',
      confirmSourceTranscription: true,
    });
    const before = await adventure.status(c.campaignId);
    await expect(
      command(c.campaignId, {
        operation: 'REVIEW_PARTY',
        expectedDigest: '0'.repeat(64),
        sourceReview: 'Conferência local das escolhas e benefícios.',
        manualRulesAccepted: true,
      }),
    ).rejects.toThrow('changed');
    await command(c.campaignId, {
      operation: 'REVIEW_PARTY',
      expectedDigest: before.snapshotDigest,
      sourceReview: 'Revisão local completa das escolhas e das limitações.',
      manualRulesAccepted: true,
    });
    await command(c.campaignId, {
      operation: 'SCENE',
      sessionId: c.sessionId,
      sceneKey: 'foiled-trap',
      reason: 'Cena inicial confirmada na estrada para Lakesheart.',
    });
    const cast = await db.db
      .select()
      .from(g.characters)
      .where(eq(g.characters.campaignId, c.campaignId));
    const pc = cast.find((r) => r.kind === 'PROTAGONIST')!;
    expect(pc).toMatchObject({ name: 'Naelis', people: "Vata'an", level: 1 });
    const aren = cast.find((r) => r.name === 'Aren Valdren')!;
    const mira = cast.find((r) => r.name === 'Mira Selwyn')!;
    const lys = cast.find((r) => r.name === 'Lys Varen')!;
    expect([aren.people, mira.people, lys.people]).toEqual([
      'Humano',
      'Marina',
      'Humana',
    ]);
    for (const [character, ability, focuses] of [
      [
        aren,
        'FIGHTING',
        ['dexterity-riding', 'communication-deception', 'constitution-stamina'],
      ],
      [mira, 'ACCURACY', ['constitution-swimming', 'dexterity-acrobatics']],
      [
        lys,
        'COMMUNICATION',
        [
          'dexterity-riding',
          'communication-persuasion',
          'accuracy-brawling',
          'intelligence-cultural-lore',
        ],
      ],
    ] as const) {
      const scores = await db.db
        .select()
        .from(g.characterAbilities)
        .where(eq(g.characterAbilities.characterId, character.id));
      expect(scores.find((score) => score.ability === ability)?.score).toBe(4);
      const features = await db.db
        .select()
        .from(g.characterFeatures)
        .where(eq(g.characterFeatures.characterId, character.id));
      expect(features.map((feature) => feature.ruleId)).toEqual(
        expect.arrayContaining(focuses),
      );
    }
    const training = await db.db
      .select()
      .from(g.weaponTraining)
      .where(eq(g.weaponTraining.characterId, aren.id));
    expect(training.map((entry) => entry.ruleId).sort()).toEqual([
      'heavy-blade',
      'light-blade',
      'longbow',
      'shortbow',
      'sling',
    ]);
    await local(c.campaignId, {
      type: 'ABILITY_SET',
      characterId: pc.id,
      ability: 'INTELLIGENCE',
      score: 2,
      reason: 'Alteração posterior à conferência, apenas neste teste.',
    });
    await http().post(`${base}/start`).send({}).expect(409);
    await expect(
      command(c.campaignId, {
        operation: 'TRANSCRIBE_SUPPLIED_PARTY',
        confirmSourceTranscription: true,
      }),
    ).rejects.toThrow('preserved');
  });
  it('preserves two-session history, independent NPC knowledge, relationships and evidence-backed objectives', async () => {
    const c = await prepared(),
      base = `/api/v1/campaigns/${c.campaignId}/sessions/${c.sessionId}`;
    await http().post(`${base}/start`).send({}).expect(200);
    const input = {
      actionId: randomUUID(),
      interactionMode: 'SPEAK',
      content: 'Vou perguntar aos moradores o que aconteceu.',
      optionId: adventureEntityId(
        c.campaignId,
        'option-foiled-trap-ask-villagers',
        legacyEntityNamespace,
      ),
    };
    expect(
      (await http().post(`${base}/actions`).send(input).expect(201)).body
        .status,
    ).toBe('COMPLETED');
    await http().post(`${base}/actions`).send(input).expect(201);
    const memories = await db.db
      .select()
      .from(a.adventureMemories)
      .where(eq(a.adventureMemories.campaignId, c.campaignId));
    expect(memories).toHaveLength(2);
    expect(memories.map((m) => m.characterKey).sort()).toEqual([
      'amos',
      'griseld',
    ]);
    await http()
      .post(`${base}/finalize`)
      .send({ endingType: 'OBJECTIVE_COMPLETED' })
      .expect(409);
    const cast = await db.db
        .select()
        .from(g.characters)
        .where(eq(g.characters.campaignId, c.campaignId)),
      pc = cast.find((r) => r.kind === 'PROTAGONIST')!,
      ally = cast.find((r) => r.name === 'Aren Valdren')!;
    await local(
      c.campaignId,
      { type: 'METRIC_DEFINE', name: 'trust', minimum: -10, maximum: 10 },
      c.sessionId,
    );
    await local(
      c.campaignId,
      {
        type: 'RELATIONSHIP_SET',
        fromCharacterId: ally.id,
        toCharacterId: pc.id,
        metric: 'trust',
        value: 2,
        visibility: 'PUBLIC',
        reason:
          'Confiança desenvolvida por acontecimentos confirmados pela mesa.',
      },
      c.sessionId,
    );
    await command(c.campaignId, {
      operation: 'REVIEW_SESSION',
      sessionId: c.sessionId,
      evidenceEventIds: [memories[0]!.eventId],
      reason:
        'Relatos obtidos; a mesa revisou os critérios e escolheu encerrar este capítulo, preservando as pendências.',
    });
    expect(
      (await http().get(`${base}/narrative-state`)).body.objectiveCompleted,
    ).toBe(true);
    const history = (await http().get(`${base}/messages`)).body.data;
    await http()
      .post(`${base}/finalize`)
      .send({ endingType: 'OBJECTIVE_COMPLETED' })
      .expect(200);
    const afterImport = await command(c.campaignId, { operation: 'IMPORT' });
    expect(afterImport).toMatchObject({ imported: false });
    await command(c.campaignId, {
      operation: 'SCENE',
      sessionId: c.secondId,
      sceneKey: 'foiled-trap',
      reason:
        'Desvio legítimo: o grupo voltou a conversar com os moradores antes de procurar os Fen.',
    });
    await http()
      .post(`/api/v1/campaigns/${c.campaignId}/sessions/${c.secondId}/start`)
      .send({})
      .expect(200);
    const context = await app
      .get(NarrativeContextService)
      .build(c.campaignId, c.secondId);
    expect(context.relationships[0]!.value).toBe(2);
    expect(
      context.adventure?.cast?.find((r) => r.identity?.key === 'amos')
        ?.knowledge,
    ).toHaveLength(1);
    expect(context.previous[0]!.summary).toContain('Griseld');
    expect((await http().get(`${base}/messages`)).body.data).toEqual(history);
    expect(
      (
        await http().get(
          `/api/v1/campaigns/${c.campaignId}/sessions/${c.secondId}/messages`,
        )
      ).body.data,
    ).toHaveLength(0);
  });
  it('retrieves old named-cast memories without a global cap and measures selective context', async () => {
    const c = await prepared();
    const path = `/api/v1/campaigns/${c.campaignId}/sessions/${c.sessionId}`;
    await http().post(`${path}/start`).send({}).expect(200);
    const service = app.get(NarrativeContextService);
    const before = await service.build(c.campaignId, c.sessionId);
    const [last] = await db.db
      .select({ value: sql<number>`max(${g.gameEvents.publicSequence})` })
      .from(g.gameEvents)
      .where(eq(g.gameEvents.campaignId, c.campaignId));
    let sequence = last!.value ?? 0;
    for (let i = 0; i < 42; i++) {
      const [event] = await db.db
        .insert(g.gameEvents)
        .values({
          campaignId: c.campaignId,
          sessionId: c.sessionId,
          commandId: randomUUID(),
          publicSequence: ++sequence,
          visibility: 'PUBLIC',
          changes: {},
          type: 'TEST_MEMORY',
          description:
            i === 0
              ? 'Conflito anterior presenciado por Griseld.'
              : `Relato de Amos ${i}`,
        })
        .returning();
      await db.db.insert(a.adventureMemories).values({
        campaignId: c.campaignId,
        characterKey: i === 0 ? 'griseld' : 'amos',
        eventId: event!.id,
      });
    }
    const after = await service.build(c.campaignId, c.sessionId);
    expect(
      after.adventure?.cast?.find((card) => card.identity?.key === 'griseld')
        ?.knowledge,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: 'Conflito anterior presenciado por Griseld.',
        }),
      ]),
    );
    const promptCharacters = (context: unknown) =>
      JSON.stringify({
        actionId: randomUUID(),
        campaignId: c.campaignId,
        sessionId: c.sessionId,
        stage: 'PROPOSE',
        interactionMode: 'SPEAK',
        playerMessage: 'Podemos conversar?',
        context,
        confirmed: null,
      }).length + 'DADOS:\n'.length;
    process.stdout.write(
      'phase53.context.characters ' +
        JSON.stringify({
          initialContext: JSON.stringify(before).length,
          initialPrompt: promptCharacters(before),
          with42MemoriesContext: JSON.stringify(after).length,
          with42MemoriesPrompt: promptCharacters(after),
        }) +
        '\n',
    );
    expect(promptCharacters(after)).toBeLessThan(65000);
  });
  it('keeps GM facts out of public endpoints and blocks generic combat in the manor', async () => {
    const c = await prepared();
    await command(c.campaignId, {
      operation: 'SCENE',
      sessionId: c.sessionId,
      sceneKey: 'erila',
      reason:
        'Cena de teste local: chegada ao quarto confirmada pelo operador.',
    });
    await http()
      .post(`/api/v1/campaigns/${c.campaignId}/sessions/${c.sessionId}/start`)
      .send({})
      .expect(200);
    const context = await app
      .get(NarrativeContextService)
      .build(c.campaignId, c.sessionId);
    expect(context.adventure?.cast?.[0]?.identity?.secrets.join(' ')).toContain(
      'Jaymes',
    );
    const views = await Promise.all(
      ['world-state', 'characters', 'events', 'relationships'].map((path) =>
        http().get(`/api/v1/campaigns/${c.campaignId}/${path}`),
      ),
    );
    expect(JSON.stringify(views.map((v) => v.body))).not.toContain(
      'Jaymes a matou',
    );
    await expect(
      local(
        c.campaignId,
        {
          type: 'COMBAT_START',
          visibility: 'PUBLIC',
          reason: 'Tentativa inválida',
          members: [
            {
              characterId: randomUUID(),
              weaponItemId: randomUUID(),
              x: 0,
              y: 0,
            },
            {
              characterId: randomUUID(),
              weaponItemId: randomUUID(),
              x: 1,
              y: 0,
            },
          ],
        },
        c.sessionId,
      ),
    ).rejects.toThrow('local adjudication');
    const original = (await db.db.select().from(a.adventureDefinitions))[0]!
      .definition;
    await local(
      c.campaignId,
      {
        type: 'WORLD_UPSERT',
        entityId: adventureEntityId(
          c.campaignId,
          'manor',
          legacyEntityNamespace,
        ),
        kind: 'LOCATION',
        name: 'Gloamhale Manor',
        description: 'Estado atual após consequências.',
        status: 'BURNED',
        accessible: false,
        privateNotes: '',
        visibility: 'GM_ONLY',
        reason: 'Consequência adjudicada explicitamente neste teste.',
      },
      c.sessionId,
    );
    expect(
      (await db.db.select().from(a.adventureDefinitions))[0]!.definition,
    ).toEqual(original);
  });
  it('adjudicates only current encounters, validates witnesses/evidence, and records once', async () => {
    const c = await prepared();
    await http()
      .post(`/api/v1/campaigns/${c.campaignId}/sessions/${c.sessionId}/start`)
      .send({})
      .expect(200);
    const input = {
      operation: 'ADJUDICATE',
      campaignId: c.campaignId,
      sessionId: c.sessionId,
      commandId: randomUUID(),
      encounterKey: 'foiled-trap',
      reason: 'Conversa e manifestação da jogadora verificadas localmente.',
      publicSummary:
        'O grupo ouviu os moradores e decidiu continuar a investigação.',
      evidenceEventIds: [],
      witnessKeys: ['amos'],
    };
    await expect(
      adventure.execute({ ...input, encounterKey: 'ritual' }),
    ).rejects.toThrow('current');
    await expect(
      adventure.execute({ ...input, witnessKeys: ['erila'] }),
    ).rejects.toThrow('present');
    await expect(
      adventure.execute({ ...input, evidenceEventIds: [randomUUID()] }),
    ).rejects.toThrow('Evidence');
    expect(await adventure.execute(input)).toEqual(
      await adventure.execute(input),
    );
    expect(
      await db.db
        .select()
        .from(a.adventureMemories)
        .where(eq(a.adventureMemories.campaignId, c.campaignId)),
    ).toHaveLength(1);
    await expect(
      command(c.campaignId, {
        operation: 'REVIEW_SESSION',
        sessionId: c.sessionId,
        evidenceEventIds: [randomUUID()],
        reason: 'Evidência inexistente não pode concluir o capítulo.',
      }),
    ).rejects.toThrow('Evidence');
  });
  it('rolls back the entire source transcription if audit persistence fails', async () => {
    const c = await imported();
    await db.db.execute(
      sql`CREATE FUNCTION reject_party_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.type = 'SUPPLIED_EQUIPMENT_TRANSCRIBED' THEN RAISE EXCEPTION 'audit failure'; END IF; RETURN NEW; END $$`,
    );
    await db.db.execute(
      sql`CREATE TRIGGER reject_party_audit BEFORE INSERT ON game_events FOR EACH ROW EXECUTE FUNCTION reject_party_audit()`,
    );
    try {
      await expect(
        command(c.campaignId, {
          operation: 'TRANSCRIBE_SUPPLIED_PARTY',
          confirmSourceTranscription: true,
        }),
      ).rejects.toThrow();
    } finally {
      await db.db.execute(sql`DROP TRIGGER reject_party_audit ON game_events`);
      await db.db.execute(sql`DROP FUNCTION reject_party_audit()`);
    }
    expect(
      await db.db
        .select()
        .from(g.characters)
        .where(eq(g.characters.campaignId, c.campaignId)),
    ).toHaveLength(0);
    expect(
      await db.db
        .select()
        .from(g.gameItems)
        .where(eq(g.gameItems.campaignId, c.campaignId)),
    ).toHaveLength(0);
  });
  it('recovers vata Health and fatigued characters only with the correct attested rest', async () => {
    const c = await prepared();
    await http()
      .post(`/api/v1/campaigns/${c.campaignId}/sessions/${c.sessionId}/start`)
      .send({})
      .expect(200);
    const [pc] = await db.db
      .select()
      .from(g.characters)
      .where(eq(g.characters.campaignId, c.campaignId))
      .orderBy(g.characters.name);
    const naelis = (
      await db.db
        .select()
        .from(g.characters)
        .where(eq(g.characters.campaignId, c.campaignId))
    ).find((r) => r.name === 'Naelis')!;
    expect(pc).toBeDefined();
    await db.db
      .update(g.characterResources)
      .set({ current: 1 })
      .where(eq(g.characterResources.characterId, naelis.id));
    await db.db
      .update(g.characterVitals)
      .set({ fatigueLevel: 2, breatherAvailable: true })
      .where(eq(g.characterVitals.characterId, naelis.id));
    const rest = {
      type: 'REST',
      characterId: naelis.id,
      kind: 'LIGHT_REST',
      reason: 'Quatro horas de repouso leve, com comida e água.',
    };
    await expect(local(c.campaignId, rest, c.sessionId)).rejects.toThrow(
      'food and drink',
    );
    await local(
      c.campaignId,
      { ...rest, sustenanceConfirmed: true },
      c.sessionId,
    );
    const state = (await http().get(`/api/v1/characters/${naelis.id}`)).body;
    expect(state.fatigueLevel).toBe(0);
    expect(
      state.resources.find((r: { name: string }) => r.name === 'HEALTH')
        .current,
    ).toBe(10); // 1 + 5 + (Con 1 + vata 2) + level 1
    await local(
      c.campaignId,
      { ...rest, sustenanceConfirmed: true },
      c.sessionId,
    );
    expect(
      (await http().get(`/api/v1/characters/${naelis.id}`)).body.resources.find(
        (r: { name: string }) => r.name === 'HEALTH',
      ).current,
    ).toBe(10);
  });
  it('never reveals preloaded future locations, identities or objectives', async () => {
    const c = await prepared();
    await command(c.campaignId, {
      operation: 'SCENE',
      sessionId: c.secondId,
      sceneKey: 'erila',
      reason: 'Planejamento privado de uma possibilidade do próximo capítulo.',
    });
    const future = (
      await http().get(
        `/api/v1/campaigns/${c.campaignId}/sessions/${c.secondId}/narrative-state`,
      )
    ).body;
    expect(future.availableOptions).toEqual([]);
    expect(future.objectives[0].description).toBe(
      'Objetivo ainda não revelado.',
    );
    expect(
      (await http().get(`/api/v1/campaigns/${c.campaignId}/world-state`)).body,
    ).toEqual([]);
    expect(
      (
        await db.db
          .select()
          .from(a.adventureCast)
          .where(eq(a.adventureCast.campaignId, c.campaignId))
      ).every((r) => !r.known),
    ).toBe(true);
  });
  it('runs the actual local CLI without opening an administrative HTTP endpoint', async () => {
    execFileSync('pnpm', ['build'], {
      cwd: resolve(__dirname, '../..'),
      stdio: 'pipe',
    });
    const campaignId = randomUUID(),
      path = `/tmp/gloamhale-cli-${randomUUID()}.json`;
    try {
      writeFileSync(
        path,
        JSON.stringify({
          operation: 'IMPORT',
          campaignId,
          commandId: randomUUID(),
        }),
      );
      const result = JSON.parse(
        execFileSync('node', ['dist/adventures/admin.js', path], {
          cwd: resolve(__dirname, '../..'),
          encoding: 'utf8',
          env: {
            ...process.env,
            DATABASE_URL: process.env.INTEGRATION_DATABASE_URL,
          },
        }).trim(),
      );
      expect(result).toMatchObject({
        imported: true,
        sessions: 6,
        readyToPlay: false,
      });
      expect(await adventure.status(campaignId)).toMatchObject({
        campaignId,
        reviewed: false,
      });
    } finally {
      unlinkSync(path);
    }
  });
  it('never stabilizes at zero healing and permits a later effective Cure', async () => {
    const c = await prepared();
    await http()
      .post(`/api/v1/campaigns/${c.campaignId}/sessions/${c.sessionId}/start`)
      .send({})
      .expect(200);
    const cast = await db.db
      .select()
      .from(g.characters)
      .where(eq(g.characters.campaignId, c.campaignId));
    const pc = cast.find((r) => r.kind === 'PROTAGONIST')!,
      target = cast.find((r) => r.name === 'Aren Valdren')!;
    await local(
      c.campaignId,
      {
        type: 'ABILITY_SET',
        characterId: pc.id,
        ability: 'INTELLIGENCE',
        score: -2,
        reason: 'Fixture específica para sucesso com cura zero.',
      },
      c.sessionId,
    );
    await db.db
      .update(g.characterResources)
      .set({ current: 0 })
      .where(eq(g.characterResources.characterId, target.id));
    await db.db
      .update(g.characterVitals)
      .set({ lifeState: 'DYING', fatigueLevel: 4 })
      .where(eq(g.characterVitals.characterId, target.id));
    const prepare = () =>
      local(
        c.campaignId,
        {
          type: 'ARCANA_CURE_PREPARE',
          characterId: pc.id,
          targetId: target.id,
          touchConfirmed: true,
          reason: 'Cura testada com resultado limitado pela fórmula oficial.',
          visibility: 'PUBLIC',
        },
        c.sessionId,
      );
    const cure = await prepare();
    random.d6
      .mockReturnValueOnce(6)
      .mockReturnValueOnce(6)
      .mockReturnValueOnce(1);
    await http()
      .post(`/api/v1/campaigns/${c.campaignId}/blue-rose/arcana/cure`)
      .send({ commandId: randomUUID(), requestId: cure.id })
      .expect(201);
    expect(
      (await http().get(`/api/v1/characters/${target.id}`)).body,
    ).toMatchObject({ lifeState: 'DYING', fatigueLevel: 4 });
    expect(
      (
        await db.db
          .select()
          .from(g.characterVitals)
          .where(eq(g.characterVitals.characterId, target.id))
      )[0]?.cureUsed,
    ).toBe(false);
    await local(
      c.campaignId,
      {
        type: 'ABILITY_SET',
        characterId: pc.id,
        ability: 'INTELLIGENCE',
        score: 3,
        reason: 'Restauração da fixture original para cura efetiva.',
      },
      c.sessionId,
    );
    const effective = await prepare();
    await http()
      .post(`/api/v1/campaigns/${c.campaignId}/blue-rose/arcana/cure`)
      .send({ commandId: randomUUID(), requestId: effective.id })
      .expect(201);
    expect(
      (await http().get(`/api/v1/characters/${target.id}`)).body,
    ).toMatchObject({ lifeState: 'UNCONSCIOUS', fatigueLevel: 3 });
  });
  it('stabilizes dying fatigue at level 3 and unconscious, rather than granting immediate actions', async () => {
    const c = await prepared();
    await http()
      .post(`/api/v1/campaigns/${c.campaignId}/sessions/${c.sessionId}/start`)
      .send({})
      .expect(200);
    const cast = await db.db
        .select()
        .from(g.characters)
        .where(eq(g.characters.campaignId, c.campaignId)),
      pc = cast.find((r) => r.kind === 'PROTAGONIST')!,
      target = cast.find((r) => r.name === 'Aren Valdren')!;
    await db.db
      .update(g.characterResources)
      .set({ current: 0 })
      .where(eq(g.characterResources.characterId, target.id));
    await db.db
      .update(g.characterVitals)
      .set({ fatigueLevel: 4, lifeState: 'DYING' })
      .where(eq(g.characterVitals.characterId, target.id));
    await http()
      .post(
        `/api/v1/campaigns/${c.campaignId}/sessions/${c.sessionId}/finalize`,
      )
      .send({ endingType: 'PLAYER_REQUESTED' })
      .expect(409);
    const cure = await local(
      c.campaignId,
      {
        type: 'ARCANA_CURE_PREPARE',
        characterId: pc.id,
        targetId: target.id,
        touchConfirmed: true,
        reason: 'Curar aliada à beira da morte por fadiga.',
        visibility: 'PUBLIC',
      },
      c.sessionId,
    );
    const input = { commandId: randomUUID(), requestId: cure.id };
    await http()
      .post(`/api/v1/campaigns/${c.campaignId}/blue-rose/arcana/cure`)
      .send(input)
      .expect(201);
    const state = (await http().get(`/api/v1/characters/${target.id}`)).body;
    expect(state).toMatchObject({ lifeState: 'UNCONSCIOUS', fatigueLevel: 3 });
    expect(
      (
        await db.db
          .select()
          .from(g.characterVitals)
          .where(eq(g.characterVitals.characterId, target.id))
      )[0]?.unconsciousHours,
    ).toBe(4);
    await http()
      .post(`/api/v1/campaigns/${c.campaignId}/blue-rose/arcana/cure`)
      .send(input)
      .expect(201);
    expect((await http().get(`/api/v1/characters/${target.id}`)).body).toEqual(
      state,
    );
  });
});
