import { legacyEntityNamespace } from '../../src/adventures/gloamhale/default-adventure';
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { and, eq } from 'drizzle-orm';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { DatabaseService } from '../../src/database/database.service';
import { AdventureService } from '../../src/adventures/core/operations/adventure.service';
import { GameEngineService } from '../../src/game-engine/game-engine.service';
import { AiServiceClient } from '../../src/integrations/ai-service/ai-service.client';
import { adventureEntityId } from '../../src/adventures/core/state/state';
import * as g from '../../src/database/game-schema';
import * as a from '../../src/database/arcana-schema';
import { RANDOM_SOURCE } from '../../src/blue-rose/mechanics/dice/blue-rose-dice';
import { abilities } from '@solo-rpg/shared-contracts';

describe('Arcanos AGE persistidos / PostgreSQL', () => {
  let app: INestApplication, db: DatabaseService, engine: GameEngineService;
  const random = { d6: jest.fn(() => 4) };
  const turn = jest.fn();
  const local = (
    c: { campaignId: string; sessionId: string },
    command: unknown,
    commandId = randomUUID(),
  ) =>
    engine.executeInternal({
      campaignId: c.campaignId,
      sessionId: c.sessionId,
      commandId,
      command,
    });
  const prepared = async () => {
    const campaignId = randomUUID(),
      adventure = app.get(AdventureService);
    const command = (data: Record<string, unknown>) =>
      adventure.execute({ campaignId, commandId: randomUUID(), ...data });
    await command({ operation: 'IMPORT' });
    await command({
      operation: 'TRANSCRIBE_SUPPLIED_PARTY',
      confirmSourceTranscription: true,
    });
    const report = await adventure.status(campaignId);
    await command({
      operation: 'REVIEW_PARTY',
      expectedDigest: report.snapshotDigest,
      sourceReview: 'Fichas e limitações verificadas para esta fixture.',
      manualRulesAccepted: true,
    });
    const sessionId = adventureEntityId(
      campaignId,
      'session-1',
      legacyEntityNamespace,
    );
    await command({
      operation: 'SCENE',
      sessionId,
      sceneKey: 'foiled-trap',
      reason: 'Equipe presente na estrada.',
    });
    await request(app.getHttpServer())
      .post(`/api/v1/campaigns/${campaignId}/sessions/${sessionId}/start`)
      .send({})
      .expect(200);
    const cast = await db.db
      .select()
      .from(g.characters)
      .where(eq(g.characters.campaignId, campaignId));
    return {
      campaignId,
      sessionId,
      pc: cast.find((p) => p.kind === 'PROTAGONIST')!,
      aren: cast.find((p) => p.name === 'Aren Valdren')!,
      lys: cast.find((p) => p.name.includes('Lys'))!,
    };
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RANDOM_SOURCE)
      .useValue(random)
      .overrideProvider(AiServiceClient)
      .useValue({ turn })
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
    if (app) await app.close();
  });
  beforeEach(() => random.d6.mockReset().mockReturnValue(4));
  beforeEach(() =>
    turn.mockReset().mockImplementation(async (input) => ({
      proposal:
        input.stage === 'PROPOSE'
          ? input.context.selectedMechanic
            ? { kind: 'MECHANIC', command: input.context.selectedMechanic }
            : { kind: 'OBSERVE' }
          : null,
      narration: input.stage === 'NARRATE' ? input.confirmed : null,
      usage: [],
      error: null,
    })),
  );
  it('routes free shield, healing, rest and waiting through the existing engine without a selected mechanic', async () => {
    const c = await prepared();
    const base = `/api/v1/campaigns/${c.campaignId}/sessions/${c.sessionId}`;
    let proposal: object;
    turn.mockImplementation(async (input) => ({
      proposal: input.stage === 'PROPOSE' ? proposal : null,
      narration: input.stage === 'NARRATE' ? input.confirmed : null,
      usage: [],
      error: null,
    }));
    const send = async (
      intent: string,
      tool: object,
      content: string,
      target: object | null = null,
    ) => {
      proposal = { kind: 'FREE', intent, description: content, target, tool };
      const body = { actionId: randomUUID(), interactionMode: 'ACT', content };
      const action = (
        await request(app.getHttpServer())
          .post(`${base}/actions`)
          .send(body)
          .expect(201)
      ).body;
      return { body, action };
    };
    const shield = await send(
      'ARCANA',
      { type: 'ARCANA', arcanum: 'psychic-shield', raised: true },
      'Ergo meu Escudo Psíquico.',
    );
    expect(shield.action.status).toBe('COMPLETED');
    expect(random.d6).not.toHaveBeenCalled();
    const [effect] = await db.db
      .select()
      .from(a.arcaneEffects)
      .where(
        and(
          eq(a.arcaneEffects.characterId, c.pc.id),
          eq(a.arcaneEffects.arcanum, 'psychic-shield'),
        ),
      );
    expect(effect!.active).toBe(true);
    await db.db
      .update(g.characterResources)
      .set({ current: 15 })
      .where(
        and(
          eq(g.characterResources.characterId, c.pc.id),
          eq(g.characterResources.name, 'HEALTH'),
        ),
      );
    const cure = await send(
      'ARCANA',
      { type: 'ARCANA', arcanum: 'cure' },
      'Uso Curar em mim.',
      { type: 'CHARACTER', name: c.pc.name },
    );
    expect(cure.action.status).toBe('AWAITING_ROLL');
    expect(random.d6).not.toHaveBeenCalled();
    expect(
      (
        await request(app.getHttpServer())
          .post(`${base}/actions/${cure.body.actionId}/roll`)
          .send({})
          .expect(200)
      ).body.status,
    ).toBe('COMPLETED');
    const dice = random.d6.mock.calls.length;
    await request(app.getHttpServer())
      .post(`${base}/actions`)
      .send(cure.body)
      .expect(201);
    expect(random.d6).toHaveBeenCalledTimes(dice);
    const rest = await send(
      'REST',
      { type: 'REST', kind: 'BREATHER' },
      'Faço uma pausa de 5 minutos.',
    );
    expect(rest.action.status).toBe('COMPLETED');
    const wait = await send(
      'WAIT',
      { type: 'WAIT', minutes: 3 },
      'Espero 3 minutos.',
    );
    expect(wait.action.status).toBe('COMPLETED');
    const history = (
      await request(app.getHttpServer()).get(`${base}/messages`).expect(200)
    ).body.data;
    expect(JSON.stringify(history)).not.toContain('resolvedMechanic');
    const before = (
      await db.db
        .select()
        .from(g.gameEvents)
        .where(eq(g.gameEvents.campaignId, c.campaignId))
    ).length;
    const missing = await send(
      'ARCANA',
      { type: 'ARCANA', arcanum: 'cure' },
      'Tento Curar Aren.',
      { type: 'CHARACTER', name: c.aren.name },
    );
    expect(missing.action.status).toBe('COMPLETED');
    expect(
      (
        await db.db
          .select()
          .from(g.gameEvents)
          .where(eq(g.gameEvents.campaignId, c.campaignId))
      ).length,
    ).toBe(before);
  });
  it('requests a player roll, heals a companion and preserves receipts through narrative retry', async () => {
    const c = await prepared();
    await db.db
      .update(g.characterResources)
      .set({ current: 0 })
      .where(
        and(
          eq(g.characterResources.characterId, c.aren.id),
          eq(g.characterResources.name, 'HEALTH'),
        ),
      );
    await db.db
      .update(g.characterVitals)
      .set({ lifeState: 'DYING' })
      .where(eq(g.characterVitals.characterId, c.aren.id));
    const base = `/api/v1/campaigns/${c.campaignId}/sessions/${c.sessionId}`;
    const input = {
      actionId: randomUUID(),
      interactionMode: 'ACT',
      content: 'Toco Aren e uso Curar.',
      mechanic: { type: 'CURE', characterId: c.pc.id, targetId: c.aren.id },
    };
    const action = await request(app.getHttpServer())
      .post(`${base}/actions`)
      .send(input)
      .expect(201);
    expect(action.body.status).toBe('AWAITING_ROLL');
    expect(random.d6).not.toHaveBeenCalled();
    await request(app.getHttpServer())
      .post(`${base}/actions/${input.actionId}/roll`)
      .send({})
      .expect(200);
    const [health] = await db.db
      .select()
      .from(g.characterResources)
      .where(
        and(
          eq(g.characterResources.characterId, c.aren.id),
          eq(g.characterResources.name, 'HEALTH'),
        ),
      );
    expect(health!.current).toBeGreaterThan(1);
    const count = random.d6.mock.calls.length;
    await request(app.getHttpServer())
      .post(`${base}/actions`)
      .send(input)
      .expect(201);
    expect(random.d6).toHaveBeenCalledTimes(count);
  });
  it('rejects an unsolicited protagonist mechanic and lets the player cancel an unrolled attempt', async () => {
    const c = await prepared(),
      base = `/api/v1/campaigns/${c.campaignId}/sessions/${c.sessionId}`;
    turn.mockImplementation(async () => ({
      proposal: {
        kind: 'MECHANIC',
        command: {
          type: 'ARCANA_USE',
          input: {
            characterId: c.pc.id,
            arcanum: 'psychic-shield',
            raised: false,
          },
        },
      },
      narration: null,
      usage: [],
      error: null,
    }));
    const id = randomUUID();
    const response = await request(app.getHttpServer())
      .post(`${base}/actions`)
      .send({
        actionId: id,
        interactionMode: 'ACT',
        content: 'Olho a estrada.',
      })
      .expect(201);
    expect(response.body.status).toBe('PENDING');
    expect(response.body.error).toBeTruthy();
    expect(
      await db.db
        .select()
        .from(a.arcaneEffects)
        .where(eq(a.arcaneEffects.characterId, c.pc.id)),
    ).toEqual([]);
    await request(app.getHttpServer())
      .post(`${base}/actions/${id}/cancel`)
      .send({})
      .expect(200);
    turn.mockImplementation(async (input) => ({
      proposal: { kind: 'MECHANIC', command: input.context.selectedMechanic },
      narration: null,
      usage: [],
      error: null,
    }));
    const attempt = randomUUID();
    const body = await request(app.getHttpServer())
      .post(`${base}/actions`)
      .send({
        actionId: attempt,
        interactionMode: 'ACT',
        content: 'Tento Curar.',
        mechanic: { type: 'CURE', characterId: c.pc.id, targetId: c.aren.id },
      })
      .expect(201);
    expect(body.body.status).toBe('AWAITING_ROLL');
    await request(app.getHttpServer())
      .post(`${base}/actions/${attempt}/cancel`)
      .send({})
      .expect(200);
    expect(random.d6).not.toHaveBeenCalled();
  });
  it('persists a shaped wind, rolls only once on retry, and rejects fabricated results', async () => {
    const c = await prepared(),
      contextId = randomUUID();
    await local(c, {
      type: 'ARCANA_CONTEXT_SET',
      characterId: c.pc.id,
      contextId,
      value: { kind: 'WIND', category: 0, radiusMeters: 12, lineOfSight: true },
      reason: 'Vento leve e área atual verificados.',
    });
    const input = {
      type: 'ARCANA_USE',
      input: {
        characterId: c.pc.id,
        arcanum: 'wind-shaping',
        contextId,
        category: 3,
      },
    };
    const commandId = randomUUID(),
      first = await local(c, input, commandId);
    expect(await local(c, input, commandId)).toEqual(first);
    const [effect] = await db.db
      .select()
      .from(a.arcaneEffects)
      .where(eq(a.arcaneEffects.characterId, c.pc.id));
    expect(effect).toMatchObject({
      active: true,
      sustained: true,
      value: { category: 3 },
    });
    expect(random.d6).toHaveBeenCalledTimes(3);
    await expect(
      local(c, { ...input, input: { ...input.input, total: 99 } }),
    ).rejects.toThrow();
    await local(c, {
      type: 'ARCANA_END',
      characterId: c.pc.id,
      effectId: effect!.id,
    });
    expect(
      (
        await db.db
          .select()
          .from(a.arcaneEffects)
          .where(eq(a.arcaneEffects.id, effect!.id))
      )[0]?.active,
    ).toBe(false);
  });
  it('keeps secret Sight dice private and reveals only the degree earned', async () => {
    const c = await prepared(),
      contextId = randomUUID();
    await local(c, {
      type: 'ARCANA_CONTEXT_SET',
      characterId: c.pc.id,
      contextId,
      value: {
        kind: 'TRACE',
        distanceMeters: 0,
        shieldTotal: 0,
        discipline: 'Moldar',
        arcanum: 'Moldar Vento',
        casterId: null,
      },
      reason: 'Manifestação presente, sem identidade conhecida.',
    });
    await local(c, {
      type: 'ARCANA_USE',
      input: { characterId: c.pc.id, arcanum: 'second-sight', contextId },
    });
    const rolls = await db.db
      .select()
      .from(g.diceRolls)
      .where(eq(g.diceRolls.campaignId, c.campaignId));
    expect(rolls[0]?.visibility).toBe('GM_ONLY');
    const events = await db.db
      .select()
      .from(g.gameEvents)
      .where(
        and(
          eq(g.gameEvents.campaignId, c.campaignId),
          eq(g.gameEvents.type, 'ARCANA_PERCEIVED'),
        ),
      );
    expect(events[0]?.changes).toMatchObject({ discipline: 'Moldar' });
    expect(events[0]?.changes).not.toHaveProperty('casterId');
  });
  it('validates knowledge, tradition, consent and campaign isolation before dice', async () => {
    const c = await prepared(),
      other = await prepared();
    await expect(
      local(c, {
        type: 'ARCANA_USE',
        input: {
          characterId: c.lys.id,
          arcanum: 'psychic-shield',
          raised: true,
        },
      }),
    ).rejects.toThrow('Known');
    await expect(
      local(c, {
        type: 'ARCANA_USE',
        input: {
          characterId: c.pc.id,
          arcanum: 'psychic-contact',
          targetId: c.aren.id,
          tradition: 'PSYCHIC',
        },
      }),
    ).rejects.toThrow('talent');
    await db.db.insert(g.characterFeatures).values([
      { characterId: c.aren.id, ruleId: 'meditative-talent', degree: 'NOVICE' },
      { characterId: c.aren.id, ruleId: 'body-control' },
    ]);
    await expect(
      local(c, {
        type: 'ARCANA_USE',
        input: {
          characterId: c.aren.id,
          arcanum: 'body-control',
          targetId: c.pc.id,
          tradition: 'MEDITATIVE',
          use: 'IGNORE_PAIN',
        },
      }),
    ).rejects.toThrow('self');
    await expect(
      local(c, {
        type: 'ARCANA_USE',
        input: {
          characterId: c.pc.id,
          arcanum: 'wind-shaping',
          contextId: randomUUID(),
          category: 2,
        },
      }),
    ).rejects.toThrow('context');
    await expect(
      local(c, {
        type: 'ARCANA_USE',
        input: {
          characterId: other.pc.id,
          arcanum: 'psychic-shield',
          raised: false,
        },
      }),
    ).rejects.toThrow();
    expect(random.d6).not.toHaveBeenCalled();
  });
  it('supports Meditative self control without granting Aren any unlearned arcanum', async () => {
    const c = await prepared();
    // Grant capabilities only to this arcana fixture, independent of the party preset.
    await db.db.insert(g.characterFeatures).values([
      { characterId: c.aren.id, ruleId: 'meditative-talent', degree: 'NOVICE' },
      { characterId: c.aren.id, ruleId: 'body-control' },
    ]);
    await local(c, {
      type: 'ARCANA_USE',
      input: {
        characterId: c.aren.id,
        arcanum: 'body-control',
        targetId: c.aren.id,
        tradition: 'MEDITATIVE',
        use: 'IGNORE_PAIN',
      },
    });
    expect(
      (
        await db.db
          .select()
          .from(a.arcaneEffects)
          .where(eq(a.arcaneEffects.characterId, c.aren.id))
      )[0],
    ).toMatchObject({ arcanum: 'body-control', value: { use: 'IGNORE_PAIN' } });
    await expect(
      local(c, {
        type: 'ARCANA_CURE_PREPARE',
        characterId: c.aren.id,
        targetId: c.aren.id,
        touchConfirmed: true,
        visibility: 'PUBLIC',
        reason: 'Conhecimento de Curar não consta da ficha.',
      }),
    ).rejects.toThrow();
    await local(c, {
      type: 'REST',
      characterId: c.aren.id,
      kind: 'BREATHER',
      reason:
        'O repouso encerra a concentração, preservando a escolha passiva de escudo.',
    });
    expect(
      (
        await db.db
          .select()
          .from(a.arcaneEffects)
          .where(eq(a.arcaneEffects.characterId, c.aren.id))
      )[0]?.active,
    ).toBe(false);
  });
  it('requires voluntary touch and the correct target nature for Body Control', async () => {
    const c = await prepared(),
      contextId = randomUUID();
    const command = {
      type: 'ARCANA_USE',
      input: {
        characterId: c.pc.id,
        targetId: c.aren.id,
        arcanum: 'body-control',
        tradition: 'HEALING',
        use: 'BODY_AWARENESS',
      },
    };
    await expect(local(c, command)).rejects.toThrow('willing');
    await local(c, {
      type: 'ARCANA_CONTEXT_SET',
      characterId: c.pc.id,
      contextId,
      value: {
        kind: 'CREATURE',
        targetId: c.aren.id,
        nature: 'PERSON',
        touching: false,
        willing: true,
        lineOfSight: true,
      },
      reason: 'Consentimento registrado, mas ainda sem contato físico.',
    });
    await expect(local(c, command)).rejects.toThrow('touch');
    await local(c, {
      type: 'ARCANA_CONTEXT_SET',
      characterId: c.pc.id,
      contextId,
      value: {
        kind: 'CREATURE',
        targetId: c.aren.id,
        nature: 'PERSON',
        touching: true,
        willing: true,
        lineOfSight: true,
      },
      reason: 'Aren consentiu e o toque está confirmado.',
    });
    await expect(
      local(c, {
        ...command,
        input: { ...command.input, tradition: 'ANIMISM' },
      }),
    ).rejects.toThrow('nature');
    await local(c, command);
    const [effect] = await db.db
      .select()
      .from(a.arcaneEffects)
      .where(eq(a.arcaneEffects.characterId, c.pc.id));
    expect(effect).toMatchObject({
      targetId: c.aren.id,
      value: { tradition: 'HEALING', use: 'BODY_AWARENESS' },
    });
    await expect(
      local(c, {
        type: 'ARCANA_END',
        characterId: c.aren.id,
        effectId: effect!.id,
      }),
    ).rejects.toThrow('not found');
    await expect(local(c, command)).rejects.toThrow('existing');
    expect(
      await db.db
        .select()
        .from(a.arcaneEffects)
        .where(eq(a.arcaneEffects.characterId, c.pc.id)),
    ).toHaveLength(1);
  });
  it('does not apply effects on a failed arcanum and applies the extra fatigue test only to enlarged mass', async () => {
    const c = await prepared(),
      contextId = randomUUID();
    await local(c, {
      type: 'ARCANA_CONTEXT_SET',
      characterId: c.pc.id,
      contextId,
      value: { kind: 'OBJECT', massKg: 1, unattended: true, lineOfSight: true },
      reason: 'Objeto de um quilo solto, à vista da personagem.',
    });
    random.d6.mockReturnValue(1);
    await local(c, {
      type: 'ARCANA_USE',
      input: {
        characterId: c.pc.id,
        arcanum: 'move-object',
        contextId,
        fatigue: false,
      },
    });
    expect(
      await db.db
        .select()
        .from(a.arcaneEffects)
        .where(eq(a.arcaneEffects.characterId, c.pc.id)),
    ).toEqual([]);
    expect(random.d6).toHaveBeenCalledTimes(3);
    random.d6.mockReset().mockReturnValue(4);
    await local(c, {
      type: 'ARCANA_USE',
      input: {
        characterId: c.pc.id,
        arcanum: 'move-object',
        contextId,
        fatigue: true,
      },
    });
    expect(random.d6).toHaveBeenCalledTimes(6);
    const [effect] = await db.db
      .select()
      .from(a.arcaneEffects)
      .where(eq(a.arcaneEffects.characterId, c.pc.id));
    expect(effect?.value.metersPerMinorAction).toBe(10.5); // 12 + Int 3 = 15, margem 6
    expect(
      (
        await db.db
          .select()
          .from(g.characterVitals)
          .where(eq(g.characterVitals.characterId, c.pc.id))
      )[0]?.castsSinceRest,
    ).toBe(1);
  });
  it('keeps a passive shield choice persistent and refuses to treat it as a sustained effect', async () => {
    const c = await prepared();
    await local(c, {
      type: 'ARCANA_USE',
      input: { characterId: c.pc.id, arcanum: 'psychic-shield', raised: false },
    });
    const [lowered] = await db.db
      .select()
      .from(a.arcaneEffects)
      .where(eq(a.arcaneEffects.characterId, c.pc.id));
    await expect(
      local(c, {
        type: 'ARCANA_END',
        characterId: c.pc.id,
        effectId: lowered!.id,
      }),
    ).rejects.toThrow('passive');
    await local(c, {
      type: 'ARCANA_USE',
      input: { characterId: c.pc.id, arcanum: 'psychic-shield', raised: true },
    });
    const effects = await db.db
      .select()
      .from(a.arcaneEffects)
      .where(eq(a.arcaneEffects.characterId, c.pc.id));
    expect(effects.filter((e) => e.active)).toHaveLength(1);
    expect(effects.find((e) => e.active)?.value).toEqual({ raised: true });
    expect(random.d6).not.toHaveBeenCalled();
  });
  it('advances rest time only once, preserves OOC time, and exposes choices without secret context facts', async () => {
    const c = await prepared(),
      base = `/api/v1/campaigns/${c.campaignId}/sessions/${c.sessionId}`;
    const state = (
      await request(app.getHttpServer())
        .get(`${base}/narrative-state`)
        .expect(200)
    ).body;
    const rest = state.availableMechanics.find(
      (o: { command: { type: string } }) => o.command.type === 'REST',
    );
    expect(rest).toBeDefined();
    const id = randomUUID(),
      input = {
        actionId: id,
        interactionMode: 'ACT',
        content: 'Tomo um fôlego por cinco minutos.',
        mechanic: rest.command,
      };
    expect(
      (
        await request(app.getHttpServer())
          .post(`${base}/actions`)
          .send(input)
          .expect(201)
      ).body.status,
    ).toBe('COMPLETED');
    await request(app.getHttpServer())
      .post(`${base}/actions`)
      .send(input)
      .expect(201);
    expect(
      (await app.get(AdventureService).status(c.campaignId)).narrativeMinutes,
    ).toBe(5);
    await request(app.getHttpServer())
      .post(`${base}/actions`)
      .send({
        actionId: randomUUID(),
        interactionMode: 'OUT_OF_CHARACTER',
        content: 'Como funciona a concentração?',
      })
      .expect(201);
    expect(
      (await app.get(AdventureService).status(c.campaignId)).narrativeMinutes,
    ).toBe(5);
  });
  it('rejects stale/cross-campaign contexts, unsupported target kinds, excessive area and incapacitated casters without dice', async () => {
    const c = await prepared(),
      other = await prepared(),
      contextId = randomUUID();
    await local(c, {
      type: 'ARCANA_CONTEXT_SET',
      characterId: c.pc.id,
      contextId,
      value: { kind: 'WIND', category: 0, radiusMeters: 24, lineOfSight: true },
      reason: 'Área preparada, superior ao limite do nível um.',
    });
    await expect(
      local(c, {
        type: 'ARCANA_USE',
        input: {
          characterId: c.pc.id,
          arcanum: 'wind-shaping',
          contextId,
          category: 2,
        },
      }),
    ).rejects.toThrow('area');
    await expect(
      local(c, {
        type: 'ARCANA_USE',
        input: {
          characterId: c.pc.id,
          arcanum: 'move-object',
          contextId,
          fatigue: false,
        },
      }),
    ).rejects.toThrow('object');
    await expect(
      local(other, {
        type: 'ARCANA_CONTEXT_SET',
        characterId: other.pc.id,
        contextId,
        value: {
          kind: 'OBJECT',
          massKg: 1,
          unattended: true,
          lineOfSight: true,
        },
        reason: 'Não reutilizar contexto pertencente a outra campanha.',
      }),
    ).rejects.toThrow('identity');
    await db.db
      .update(g.characterVitals)
      .set({ lifeState: 'UNCONSCIOUS' })
      .where(eq(g.characterVitals.characterId, c.pc.id));
    await expect(
      local(c, {
        type: 'ARCANA_USE',
        input: {
          characterId: c.pc.id,
          arcanum: 'psychic-shield',
          raised: false,
        },
      }),
    ).rejects.toThrow('cannot act');
    expect(random.d6).not.toHaveBeenCalled();
  });
  it('lets Mira establish ordinary two-way animal contact without reading thoughts or granting unlearned arcana', async () => {
    const c = await prepared();
    const mira = (
      await db.db
        .select()
        .from(g.characters)
        .where(eq(g.characters.campaignId, c.campaignId))
    ).find((p) => p.name.startsWith('Mira'))!;
    // Grant capabilities only to this arcana fixture, independent of the party preset.
    await db.db.insert(g.characterFeatures).values([
      { characterId: mira.id, ruleId: 'animism-talent', degree: 'NOVICE' },
      { characterId: mira.id, ruleId: 'psychic-contact' },
    ]);
    const animal = await local(c, {
      type: 'CHARACTER_CREATE',
      kind: 'NPC',
      known: true,
      living: true,
      sheet: {
        commandId: randomUUID(),
        name: 'Animal da fixture',
        people: 'Animal',
        characterClass: 'WARRIOR',
        background: 'Fixture de Animismo',
        level: 1,
        maxHealth: 20,
        abilities: Object.fromEntries(abilities.map((ability) => [ability, 1])),
        features: [],
      },
    });
    const contextId = randomUUID(),
      input = {
        characterId: mira.id,
        arcanum: 'psychic-contact',
        targetId: animal.id,
        tradition: 'ANIMISM',
      };
    await local(c, {
      type: 'ARCANA_CONTEXT_SET',
      contextId,
      characterId: mira.id,
      value: {
        kind: 'CREATURE',
        targetId: animal.id,
        nature: 'ANIMAL',
        touching: false,
        willing: false,
        lineOfSight: true,
      },
      reason: 'Animal presente mas ainda sem consentimento registrado.',
    });
    await expect(local(c, { type: 'ARCANA_USE', input })).rejects.toThrow(
      'willing',
    );
    await local(c, {
      type: 'ARCANA_CONTEXT_SET',
      contextId,
      characterId: mira.id,
      value: {
        kind: 'CREATURE',
        targetId: animal.id,
        nature: 'ANIMAL',
        touching: false,
        willing: true,
        lineOfSight: true,
      },
      reason: 'Animal voluntário e presente nesta cena.',
    });
    await local(c, { type: 'ARCANA_USE', input });
    const [effect] = await db.db
      .select()
      .from(a.arcaneEffects)
      .where(eq(a.arcaneEffects.characterId, mira.id));
    expect(effect).toMatchObject({
      targetId: animal.id,
      value: { twoWay: true, mindReading: false },
    });
  });
  it('refuses sensory assertions without canonical facts and invalidates contexts when the prepared scene changes', async () => {
    const c = await prepared(),
      contextId = randomUUID();
    await expect(
      local(c, {
        type: 'ARCANA_USE',
        input: { characterId: c.pc.id, arcanum: 'second-sight' },
      }),
    ).rejects.toThrow('canonical');
    await local(c, {
      type: 'ARCANA_CONTEXT_SET',
      contextId,
      characterId: c.pc.id,
      value: { kind: 'OBJECT', massKg: 1, unattended: true, lineOfSight: true },
      reason: 'Objeto à vista na cena inicial.',
    });
    await app.get(AdventureService).execute({
      campaignId: c.campaignId,
      sessionId: c.sessionId,
      commandId: randomUUID(),
      operation: 'SCENE',
      sceneKey: 'village',
      reason: 'A equipe saiu da estrada e chegou à vila.',
    });
    await expect(
      local(c, {
        type: 'ARCANA_USE',
        input: {
          characterId: c.pc.id,
          arcanum: 'move-object',
          contextId,
          fatigue: false,
        },
      }),
    ).rejects.toThrow('current scene');
    expect(random.d6).not.toHaveBeenCalled();
  });
  it.each([
    [0, false, 1, 'ALIVE'],
    [1, false, 2, 'ALIVE'],
    [2, false, 3, 'ALIVE'],
    [2, true, 3, 'UNCONSCIOUS'],
    [3, false, 4, 'DYING'],
  ] as const)(
    'applies failed enlarged-mass fatigue from level %i with low Health %s',
    async (before, low, expected, lifeState) => {
      const c = await prepared(),
        contextId = randomUUID();
      await local(c, {
        type: 'ARCANA_USE',
        input: {
          characterId: c.pc.id,
          arcanum: 'body-control',
          targetId: c.pc.id,
          tradition: 'HEALING',
          use: 'IGNORE_PAIN',
        },
      });
      const [health] = await db.db
        .select()
        .from(g.characterResources)
        .where(
          and(
            eq(g.characterResources.characterId, c.pc.id),
            eq(g.characterResources.name, 'HEALTH'),
          ),
        );
      await db.db
        .update(g.characterResources)
        .set({ current: low ? 1 : health!.maximum })
        .where(
          and(
            eq(g.characterResources.characterId, c.pc.id),
            eq(g.characterResources.name, 'HEALTH'),
          ),
        );
      await db.db
        .update(g.characterVitals)
        .set({ fatigueLevel: before })
        .where(eq(g.characterVitals.characterId, c.pc.id));
      await local(c, {
        type: 'ARCANA_CONTEXT_SET',
        characterId: c.pc.id,
        contextId,
        value: {
          kind: 'OBJECT',
          massKg: 1,
          unattended: true,
          lineOfSight: true,
        },
        reason: 'Objeto e custo fatigante preparados para este teste.',
      });
      random.d6
        .mockReset()
        .mockReturnValue(1)
        .mockReturnValueOnce(6)
        .mockReturnValueOnce(6)
        .mockReturnValueOnce(6);
      await local(c, {
        type: 'ARCANA_USE',
        input: {
          characterId: c.pc.id,
          arcanum: 'move-object',
          contextId,
          fatigue: true,
        },
      });
      expect(
        (
          await db.db
            .select()
            .from(g.characterVitals)
            .where(eq(g.characterVitals.characterId, c.pc.id))
        )[0],
      ).toMatchObject({ fatigueLevel: expected, lifeState, castsSinceRest: 1 });
      const active = await db.db
        .select()
        .from(a.arcaneEffects)
        .where(
          and(
            eq(a.arcaneEffects.characterId, c.pc.id),
            eq(a.arcaneEffects.active, true),
          ),
        );
      expect(active).toHaveLength(lifeState === 'ALIVE' ? 2 : 0);
      if (lifeState === 'DYING')
        expect(
          (
            await db.db
              .select()
              .from(g.characterResources)
              .where(
                and(
                  eq(g.characterResources.characterId, c.pc.id),
                  eq(g.characterResources.name, 'HEALTH'),
                ),
              )
          )[0]?.current,
        ).toBe(0);
    },
  );
  it('applies Sight outcome degrees, uses an improved focus, and never turns a failure into a caster identity', async () => {
    const c = await prepared(),
      contextId = randomUUID();
    await db.db.insert(g.characterFeatures).values({
      characterId: c.pc.id,
      ruleId: 'perception-psychic',
      improved: true,
    });
    await local(c, {
      type: 'ARCANA_CONTEXT_SET',
      characterId: c.pc.id,
      contextId,
      value: {
        kind: 'TRACE',
        distanceMeters: 0,
        shieldTotal: 0,
        discipline: 'Moldar',
        arcanum: 'Mover Objeto',
        casterId: c.aren.id,
      },
      reason: 'Manifestação de um usuário conhecido neste teste.',
    });
    random.d6.mockReturnValue(6);
    await local(c, {
      type: 'ARCANA_USE',
      input: { characterId: c.pc.id, arcanum: 'second-sight' },
    });
    let events = await db.db
      .select()
      .from(g.gameEvents)
      .where(
        and(
          eq(g.gameEvents.campaignId, c.campaignId),
          eq(g.gameEvents.type, 'ARCANA_PERCEIVED'),
        ),
      )
      .orderBy(g.gameEvents.sequence);
    expect(events[0]?.changes).toMatchObject({
      information: 'KNOWN_CASTER',
      arcanum: 'Mover Objeto',
      casterId: c.aren.id,
    });
    await local(c, {
      type: 'ARCANA_CONTEXT_SET',
      characterId: c.pc.id,
      contextId,
      value: {
        kind: 'TRACE',
        distanceMeters: 30,
        shieldTotal: 30,
        discipline: 'Moldar',
        arcanum: 'Mover Objeto',
        casterId: c.aren.id,
      },
      reason: 'Escudo e distância tornam esta percepção mais difícil.',
    });
    random.d6.mockReturnValue(1);
    await local(c, {
      type: 'ARCANA_USE',
      input: { characterId: c.pc.id, arcanum: 'second-sight', contextId },
    });
    events = await db.db
      .select()
      .from(g.gameEvents)
      .where(
        and(
          eq(g.gameEvents.campaignId, c.campaignId),
          eq(g.gameEvents.type, 'ARCANA_PERCEIVED'),
        ),
      )
      .orderBy(g.gameEvents.sequence);
    expect(events[1]?.changes).toEqual({ information: 'NONE' });
  });
  it('requires both knowledge and a real talent, rejects wrong context types and impossible mass before dice', async () => {
    const c = await prepared(),
      contextId = randomUUID();
    await db.db
      .insert(g.characterFeatures)
      .values({ characterId: c.lys.id, ruleId: 'second-sight' });
    await expect(
      local(c, {
        type: 'ARCANA_USE',
        input: { characterId: c.lys.id, arcanum: 'second-sight' },
      }),
    ).rejects.toThrow('talent');
    await local(c, {
      type: 'ARCANA_CONTEXT_SET',
      characterId: c.pc.id,
      contextId,
      value: {
        kind: 'OBJECT',
        massKg: 1000,
        unattended: true,
        lineOfSight: true,
      },
      reason: 'Massa conhecida, superior à capacidade sem ampliação.',
    });
    await expect(
      local(c, {
        type: 'ARCANA_USE',
        input: {
          characterId: c.pc.id,
          arcanum: 'wind-shaping',
          contextId,
          category: 1,
        },
      }),
    ).rejects.toThrow('Wind');
    await expect(
      local(c, {
        type: 'ARCANA_USE',
        input: { characterId: c.pc.id, arcanum: 'second-sight', contextId },
      }),
    ).rejects.toThrow('trace');
    await expect(
      local(c, {
        type: 'ARCANA_USE',
        input: {
          characterId: c.pc.id,
          arcanum: 'move-object',
          contextId,
          fatigue: false,
        },
      }),
    ).rejects.toThrow('Mass');
    expect(random.d6).not.toHaveBeenCalled();
  });
  it('exposes only current prepared wind/object choices and allows an explicitly chosen wind through the Master', async () => {
    const c = await prepared(),
      wind = randomUUID(),
      object = randomUUID();
    await local(c, {
      type: 'ARCANA_CONTEXT_SET',
      characterId: c.pc.id,
      contextId: wind,
      value: { kind: 'WIND', category: 0, radiusMeters: 12, lineOfSight: true },
      reason: 'Vento conhecido na área atual.',
    });
    await local(c, {
      type: 'ARCANA_CONTEXT_SET',
      characterId: c.pc.id,
      contextId: object,
      value: { kind: 'OBJECT', massKg: 1, unattended: true, lineOfSight: true },
      reason: 'Objeto solto e visível na área atual.',
    });
    const base = `/api/v1/campaigns/${c.campaignId}/sessions/${c.sessionId}`;
    let state = (
      await request(app.getHttpServer())
        .get(`${base}/narrative-state`)
        .expect(200)
    ).body;
    expect(
      state.availableMechanics.some(
        (o: { label: string }) => o.label === 'Mover objeto preparado',
      ),
    ).toBe(true);
    const choice = state.availableMechanics.find(
      (o: { label: string }) => o.label === 'Moldar Vento: vento forte',
    );
    const id = randomUUID();
    expect(
      (
        await request(app.getHttpServer())
          .post(`${base}/actions`)
          .send({
            actionId: id,
            interactionMode: 'ACT',
            content: 'Moldo o vento para que fique forte.',
            mechanic: choice.command,
          })
          .expect(201)
      ).body.pendingRoll.ability,
    ).toBe('INTELLIGENCE');
    await request(app.getHttpServer())
      .post(`${base}/actions/${id}/roll`)
      .send({})
      .expect(200);
    state = (
      await request(app.getHttpServer())
        .get(`${base}/narrative-state`)
        .expect(200)
    ).body;
    expect(
      state.availableMechanics.some(
        (o: { command: { type: string } }) => o.command.type === 'ARCANA_END',
      ),
    ).toBe(true);
  });
  it('allows a companion mechanic without choosing a protagonist action and rejects an NPC decision to rest for the party', async () => {
    const c = await prepared(),
      base = `/api/v1/campaigns/${c.campaignId}/sessions/${c.sessionId}`;
    // Grant capabilities only to this arcana fixture, independent of the party preset.
    await db.db.insert(g.characterFeatures).values([
      { characterId: c.aren.id, ruleId: 'meditative-talent', degree: 'NOVICE' },
      { characterId: c.aren.id, ruleId: 'body-control' },
    ]);
    turn.mockImplementation(async (input) => ({
      proposal:
        input.stage === 'PROPOSE'
          ? {
              kind: 'MECHANIC',
              command: {
                type: 'ARCANA_USE',
                input: {
                  characterId: c.aren.id,
                  targetId: c.aren.id,
                  arcanum: 'body-control',
                  tradition: 'MEDITATIVE',
                  use: 'IGNORE_PAIN',
                },
              },
            }
          : null,
      narration: input.stage === 'NARRATE' ? input.confirmed : null,
      usage: [],
      error: null,
    }));
    const id = randomUUID(),
      response = await request(app.getHttpServer())
        .post(`${base}/actions`)
        .send({
          actionId: id,
          interactionMode: 'ACT',
          content: 'Aguardo enquanto Aren se concentra.',
        })
        .expect(201);
    expect(response.body.pendingRoll.ability).toBe('WILLPOWER');
    await request(app.getHttpServer())
      .post(`${base}/actions/${id}/roll`)
      .send({})
      .expect(200);
    turn.mockImplementation(async () => ({
      proposal: {
        kind: 'MECHANIC',
        command: { type: 'REST', characterId: c.aren.id, kind: 'SLEEP' },
      },
      narration: null,
      usage: [],
      error: null,
    }));
    const rest = await request(app.getHttpServer())
      .post(`${base}/actions`)
      .send({
        actionId: randomUUID(),
        interactionMode: 'ACT',
        content: 'Continuamos a conversar.',
      })
      .expect(201);
    expect(rest.body.error).toBeTruthy();
    expect(
      (await app.get(AdventureService).status(c.campaignId)).narrativeMinutes,
    ).toBe(0);
  });
});
