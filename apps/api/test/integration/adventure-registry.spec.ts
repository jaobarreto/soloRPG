import {
  defaultAdventure,
  currentAdventure,
  legacyEntityNamespace,
} from '../../src/adventures/gloamhale/default-adventure';
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { and, eq, sql } from 'drizzle-orm';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { DatabaseService } from '../../src/database/database.service';
import { AdventureRegistry } from '../../src/adventures/core/registry/registry';
import { gloamhaleModule } from '../../src/adventures/gloamhale/gloamhale-module';
import { AdventureService } from '../../src/adventures/core/operations/adventure.service';
import { adventureEntityId } from '../../src/adventures/core/state/state';
import { GameEngineService } from '../../src/game-engine/game-engine.service';
import { AiServiceClient } from '../../src/integrations/ai-service/ai-service.client';
import { RANDOM_SOURCE } from '../../src/blue-rose/mechanics/dice/blue-rose-dice';
import { testAdventure } from '../fixtures/adventure';
import * as a from '../../src/database/adventure-schema';
import * as g from '../../src/database/game-schema';
import * as n from '../../src/database/narrative-schema';

describe('Independent adventure import and autonomous prepared capabilities / PostgreSQL', () => {
  let app: INestApplication,
    db: DatabaseService,
    adventure: AdventureService,
    engine: GameEngineService;
  const turn = jest.fn(async (input) => ({
    proposal:
      input.stage === 'PROPOSE'
        ? input.context.selectedOptionId
          ? { kind: 'SCENE', optionId: input.context.selectedOptionId }
          : { kind: 'OBSERVE' }
        : null,
    narration: input.stage === 'NARRATE' ? input.confirmed : null,
    usage: [],
    error: null,
  }));
  const http = () => request(app.getHttpServer());
  const local = (campaignId: string, command: unknown) =>
    engine.executeInternal({ campaignId, commandId: randomUUID(), command });
  const command = (campaignId: string, rest: Record<string, unknown>) =>
    adventure.execute({ campaignId, commandId: randomUUID(), ...rest });
  beforeAll(async () => {
    const definition = testAdventure();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AdventureRegistry)
      .useValue(
        new AdventureRegistry(
          [gloamhaleModule, { definition, entityNamespace: definition.id }],
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
  const prepared = async () => {
    const campaignId = randomUUID();
    await command(campaignId, {
      operation: 'IMPORT',
      adventureId: 'test-lantern',
      version: 1,
    });
    const { id: pc } = await local(campaignId, {
      type: 'CHARACTER_CREATE',
      sheet: {
        commandId: randomUUID(),
        name: 'Heroína de teste',
        people: 'Humana',
        background: 'Original da fixture',
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
      kind: 'PROTAGONIST',
      known: true,
    });
    await local(campaignId, {
      type: 'COMBAT_CONFIGURE',
      characterId: pc,
      armorType: 'NONE',
      armorTrained: false,
      shieldType: 'NONE',
      shieldTrained: false,
      baseSpeed: 10,
      weaponTraining: ['staff'],
      reason: 'Perfil original da fixture, sem material de livro.',
    });
    const report = await adventure.status(campaignId);
    expect(report.review.errors).toEqual([]);
    await command(campaignId, {
      operation: 'REVIEW_PARTY',
      expectedDigest: report.snapshotDigest,
      sourceReview: 'Fixture original revisada antes do início para os testes.',
      manualRulesAccepted: true,
    });
    return {
      campaignId,
      pc,
      sessionId: adventureEntityId(campaignId, 'session-1', 'test-lantern'),
      secondId: adventureEntityId(campaignId, 'session-2', 'test-lantern'),
    };
  };
  it('imports independently, rejects unregistered versions and preserves active instances on retry', async () => {
    const c = await prepared();
    await expect(
      command(randomUUID(), {
        operation: 'IMPORT',
        adventureId: 'test-lantern',
        version: 2,
      }),
    ).rejects.toThrow('registered');
    const otherId = randomUUID();
    await command(otherId, { operation: 'IMPORT' });
    await expect(
      command(c.campaignId, { operation: 'IMPORT' }),
    ).rejects.toThrow('Different adventure');
    await http()
      .post(`/api/v1/campaigns/${c.campaignId}/sessions/${c.sessionId}/start`)
      .send({})
      .expect(200);
    const [before] = await db.db
      .select()
      .from(a.adventureInstances)
      .where(eq(a.adventureInstances.campaignId, c.campaignId));
    const retried = await command(c.campaignId, {
      operation: 'IMPORT',
      adventureId: 'test-lantern',
      version: 1,
    });
    expect(retried).toMatchObject({ imported: false });
    expect(
      (
        await db.db
          .select()
          .from(a.adventureInstances)
          .where(eq(a.adventureInstances.campaignId, c.campaignId))
      )[0],
    ).toEqual(before);
    expect(
      (
        await db.db
          .select()
          .from(a.adventureCast)
          .where(eq(a.adventureCast.campaignId, otherId))
      ).some((r) => r.key === 'keeper'),
    ).toBe(false);
  });
  it('plays two sessions with time, scene transition, Cure, objective evidence and memory without admin during play', async () => {
    const c = await prepared();
    const base = `/api/v1/campaigns/${c.campaignId}/sessions/${c.sessionId}`;
    await http().post(`${base}/start`).send({}).expect(200);
    expect(
      (await http().get(`${base}/narrative-state`)).body.objectiveCompleted,
    ).toBe(false);
    const ooc = {
      actionId: randomUUID(),
      interactionMode: 'OUT_OF_CHARACTER',
      content: 'Pausamos dez minutos para conversar.',
    };
    await http().post(`${base}/actions`).send(ooc).expect(201);
    expect(
      (
        await db.db
          .select()
          .from(a.adventureInstances)
          .where(eq(a.adventureInstances.campaignId, c.campaignId))
      )[0]!.narrativeMinutes,
    ).toBe(0);
    const input = {
      actionId: randomUUID(),
      interactionMode: 'ACT',
      content: 'Vou acender a lanterna.',
      optionId: adventureEntityId(
        c.campaignId,
        'option-room-light',
        'test-lantern',
      ),
    };
    await http().post(`${base}/actions`).send(input).expect(201);
    await http().post(`${base}/actions`).send(input).expect(201);
    expect(
      (
        await db.db
          .select()
          .from(a.adventureInstances)
          .where(eq(a.adventureInstances.campaignId, c.campaignId))
      )[0]!.narrativeMinutes,
    ).toBe(2);
    const progress = (await http().get(`${base}/narrative-state`)).body;
    expect(progress.objectiveCompleted).toBe(true);
    expect(progress.objectives[0].evidenceEventIds.length).toBeGreaterThan(0);
    expect(progress.availableOptions[0].intent).toBe('Usar Curar em si');
    expect(
      (
        await db.db
          .select()
          .from(g.worldEntities)
          .where(eq(g.worldEntities.campaignId, c.campaignId))
      )[0]!.status,
    ).toBe('LIT');
    await http()
      .post(`${base}/actions`)
      .send({
        actionId: randomUUID(),
        interactionMode: 'ACT',
        content: 'Vou usar Curar em mim.',
        optionId: progress.availableOptions[0].id,
      })
      .expect(201);
    expect(
      await db.db
        .select()
        .from(g.gameEvents)
        .where(
          and(
            eq(g.gameEvents.campaignId, c.campaignId),
            eq(g.gameEvents.type, 'ARCANA_RESOLVED'),
          ),
        ),
    ).toHaveLength(1);
    await http()
      .post(`${base}/finalize`)
      .send({ endingType: 'OBJECTIVE_COMPLETED' })
      .expect(200);
    await http()
      .post(`/api/v1/campaigns/${c.campaignId}/sessions/${c.secondId}/start`)
      .send({})
      .expect(200);
    const second = `/api/v1/campaigns/${c.campaignId}/sessions/${c.secondId}`;
    const checkAction = randomUUID();
    const pending = await http()
      .post(`${second}/actions`)
      .send({
        actionId: checkAction,
        interactionMode: 'ACT',
        content: 'Vou examinar a sala.',
        optionId: adventureEntityId(
          c.campaignId,
          'option-rest-inspect',
          'test-lantern',
        ),
      })
      .expect(201);
    expect(pending.body.status).toBe('AWAITING_ROLL');
    expect(
      (await http().get(`${second}/narrative-state`)).body.objectiveCompleted,
    ).toBe(false);
    await http()
      .post(`${second}/actions/${checkAction}/roll`)
      .send({})
      .expect(200);
    expect(
      (await http().get(`${second}/narrative-state`)).body.objectiveCompleted,
    ).toBe(true);
    await http()
      .post(`${second}/finalize`)
      .send({ endingType: 'OBJECTIVE_COMPLETED' })
      .expect(200);
    expect(
      (await http().get(`${base}/messages`)).body.data.some(
        (m: { content: string }) => m.content.includes('lanterna'),
      ),
    ).toBe(true);
    const memory = await db.db
      .select()
      .from(a.adventureMemories)
      .where(eq(a.adventureMemories.campaignId, c.campaignId));
    expect(memory.length).toBeGreaterThan(0);
    expect(JSON.stringify(progress)).not.toContain('Segredo exclusivo');
  });
  it('requires the successful option receipt and its event in the same session', async () => {
    const c = await prepared();
    const base = `/api/v1/campaigns/${c.campaignId}/sessions/${c.sessionId}`;
    await http().post(`${base}/start`).send({}).expect(200);
    const id = randomUUID();
    await http()
      .post(`${base}/actions`)
      .send({
        actionId: id,
        interactionMode: 'ACT',
        content: 'Acender a lanterna',
        optionId: adventureEntityId(
          c.campaignId,
          'option-room-light',
          'test-lantern',
        ),
      })
      .expect(201);
    // A forged receipt without a source event is not evidence, even if it claims success.
    await db.db
      .update(n.narrativeActions)
      .set({ confirmed: { narrative: 'Sem evento', eventIds: [randomUUID()] } })
      .where(eq(n.narrativeActions.id, id));
    expect(
      (await http().get(`${base}/narrative-state`)).body.objectiveCompleted,
    ).toBe(false);
    const unrelated = await engine.executeInternal({
      campaignId: c.campaignId,
      sessionId: c.sessionId,
      commandId: randomUUID(),
      command: {
        type: 'EVENT_RECORD',
        eventType: 'CONSEQUENCE_RECORDED',
        description: 'Outro acontecimento, sem relação com a opção.',
        participants: [c.pc],
        visibility: 'PUBLIC',
      },
    });
    await db.db
      .update(n.narrativeActions)
      .set({
        confirmed: {
          narrative: 'Evento de outra ação',
          eventIds: [unrelated.id],
        },
      })
      .where(eq(n.narrativeActions.id, id));
    expect(
      (await http().get(`${base}/narrative-state`)).body.objectiveCompleted,
    ).toBe(false);
    await http()
      .post(`${base}/finalize`)
      .send({ endingType: 'OBJECTIVE_COMPLETED' })
      .expect(409);
  });
  it('rolls back duration and transition when the clock audit fails, then retries once', async () => {
    const c = await prepared();
    const base = `/api/v1/campaigns/${c.campaignId}/sessions/${c.sessionId}`;
    await http().post(`${base}/start`).send({}).expect(200);
    await db.db.execute(
      sql`CREATE FUNCTION reject_fixture_clock() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.type = 'NARRATIVE_TIME_ADVANCED' THEN RAISE EXCEPTION 'audit failure'; END IF; RETURN NEW; END $$`,
    );
    await db.db.execute(
      sql`CREATE TRIGGER reject_fixture_clock BEFORE INSERT ON game_events FOR EACH ROW EXECUTE FUNCTION reject_fixture_clock()`,
    );
    const input = {
      actionId: randomUUID(),
      interactionMode: 'ACT',
      content: 'Acender a lanterna',
      optionId: adventureEntityId(
        c.campaignId,
        'option-room-light',
        'test-lantern',
      ),
    };
    try {
      expect(
        (await http().post(`${base}/actions`).send(input)).body.status,
      ).toBe('PENDING');
      expect(
        (
          await db.db
            .select()
            .from(a.adventureInstances)
            .where(eq(a.adventureInstances.campaignId, c.campaignId))
        )[0]!.narrativeMinutes,
      ).toBe(0);
      expect(
        (
          await db.db
            .select()
            .from(a.adventureScenes)
            .where(eq(a.adventureScenes.sessionId, c.sessionId))
        )[0]!.sceneKey,
      ).toBe('room');
    } finally {
      await db.db.execute(
        sql`DROP TRIGGER reject_fixture_clock ON game_events`,
      );
      await db.db.execute(sql`DROP FUNCTION reject_fixture_clock()`);
    }
    await http()
      .post(`${base}/actions/${input.actionId}/retry`)
      .send({})
      .expect(200);
    expect(
      (
        await db.db
          .select()
          .from(a.adventureInstances)
          .where(eq(a.adventureInstances.campaignId, c.campaignId))
      )[0]!.narrativeMinutes,
    ).toBe(2);
  });
  it('keeps private evidence IDs out of the public objective projection', async () => {
    const c = await prepared();
    const base = `/api/v1/campaigns/${c.campaignId}/sessions/${c.sessionId}`;
    await http().post(`${base}/start`).send({}).expect(200);
    const secret = await engine.executeInternal({
      campaignId: c.campaignId,
      sessionId: c.sessionId,
      commandId: randomUUID(),
      command: {
        type: 'EVENT_RECORD',
        eventType: 'CONSEQUENCE_RECORDED',
        description: 'Evidência privada conferida pelo operador.',
        participants: [],
        visibility: 'GM_ONLY',
      },
    });
    await command(c.campaignId, {
      operation: 'REVIEW_SESSION',
      sessionId: c.sessionId,
      reason:
        'Critérios subjetivos atestados localmente com evidência privada.',
      evidenceEventIds: [secret.id],
    });
    const progress = (await http().get(`${base}/narrative-state`)).body;
    expect(progress.objectiveCompleted).toBe(true);
    expect(JSON.stringify(progress)).not.toContain(secret.id);
  });
  it('adds clock metadata to legacy rows without changing mechanics or historical identifiers', async () => {
    await db.db.transaction(async (tx) => {
      // Temp shadow table confines the upgrade simulation to this connection.
      await tx.execute(
        sql`CREATE TEMP TABLE adventure_instances (campaign_id uuid PRIMARY KEY, definition_id text NOT NULL, mechanics jsonb) ON COMMIT DROP`,
      );
      const campaignId = randomUUID();
      await tx.execute(
        sql`INSERT INTO adventure_instances VALUES (${campaignId}, 'six-of-swords-gloamhale:v1', '{"stage":2,"elapsedMinutes":120,"children":{},"nextChangeAt":180}'::jsonb)`,
      );
      const migration = readFileSync(
        resolve(__dirname, '../../drizzle/0007_adventure_registry_time.sql'),
        'utf8',
      );
      for (const statement of migration.split('--> statement-breakpoint'))
        if (statement.trim()) await tx.execute(sql.raw(statement));
      const result = await tx.execute(sql`SELECT * FROM adventure_instances`);
      expect(result.rows[0]).toMatchObject({
        campaign_id: campaignId,
        entity_namespace: 'gloamhale',
        narrative_minutes: 0,
        mechanics: { stage: 2, elapsedMinutes: 120, nextChangeAt: 180 },
      });
      expect(
        adventureEntityId(
          campaignId,
          'session-1',
          String(result.rows[0]!.entity_namespace),
        ),
      ).toBe(adventureEntityId(campaignId, 'session-1', legacyEntityNamespace));
    });
  });
});
