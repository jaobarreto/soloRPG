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
import { AiServiceClient } from '../../src/integrations/ai-service/ai-service.client';
import { GLOAMHALE_ADVENTURES } from '../../src/adventures/gloamhale/gloamhale.module';
import { gloamhaleVersion } from '../../src/adventures/gloamhale/gloamhale-module';
import { gloamhaleV5 } from '../../src/adventures/gloamhale/definitions/v5/gloamhale-v5';
import { travelOpening } from '../../src/adventures/gloamhale/travel-opening';
import { roadObjects } from '../../src/adventures/gloamhale/road-objects';
import {
  objectExaminationEvent,
  pinnedSceneObjects,
} from '../../src/adventures/core/objects/scene-objects';
import { AdventureRegistry } from '../../src/adventures/core/registry/registry';
import { loadAdventure } from '../../src/adventures/core/state/state';
import { gameEvents, eventParticipants } from '../../src/database/game-schema';
import { adventureMemories } from '../../src/database/adventure-schema';
import { characterKnowledge } from '../../src/database/narrative-schema';
import { sessionMessages } from '../../src/database/schema';

type Execution = { campaignId: string; sessionId: string };
type Turn = {
  stage: string;
  playerMessage?: string;
  confirmed?: { narrative: string; eventIds: string[] };
};

describe('Session I object interaction / PostgreSQL', () => {
  let app: INestApplication;
  let db: DatabaseService;
  const fake = async (input: Turn) => ({
    proposal: input.stage === 'PROPOSE' ? { kind: 'OBSERVE' } : null,
    narration:
      input.stage === 'NARRATE'
        ? input.playerMessage === 'Quero examinar essa carroça.'
          ? {
              narrative:
                'Há uma chave escondida na carga, e a armadilha disparou.',
              eventIds: input.confirmed?.eventIds,
            }
          : input.confirmed
        : null,
    usage: [],
    error: null,
  });
  const turn = jest.fn(fake);
  const http = () => request(app.getHttpServer());
  const base = (c: Execution) => `/api/v1/campaigns/${c.campaignId}`;
  const play = (c: Execution) => `${base(c)}/sessions/${c.sessionId}`;
  const library = '/api/v1/campaigns/library';
  const queue = (c: Execution, interactionMode: string, content: string) =>
    http()
      .post(`${play(c)}/messages/queue`)
      .send({ id: randomUUID(), interactionMode, content })
      .expect(201);
  const advance = (c: Execution, id = randomUUID()) =>
    http()
      .post(`${play(c)}/continue`)
      .send({ id })
      .expect(200);
  const diary = async (c: Execution) =>
    (
      await http()
        .get(`${play(c)}/messages`)
        .expect(200)
    ).body.data;
  const state = async (c: Execution) =>
    (
      await http()
        .get(`${play(c)}/narrative-state`)
        .expect(200)
    ).body;
  const events = (c: Execution) =>
    db.db
      .select()
      .from(gameEvents)
      .where(
        and(
          eq(gameEvents.campaignId, c.campaignId),
          eq(gameEvents.type, objectExaminationEvent),
        ),
      );
  const send = async (c: Execution, mode: string, text: string) => {
    await queue(c, mode, text);
    await advance(c);
    return (await diary(c)).at(-1);
  };
  async function start(c: Execution, companions: string[]) {
    const preparation = `${base(c)}/preparation`;
    const { body } = await http().post(preparation).expect(200);
    await http()
      .post(`${preparation}/confirm`)
      .send({
        confirmed: true,
        revision: body.adventure.revision,
        companions,
      })
      .expect(200);
    await http()
      .post(`${play(c)}/start`)
      .expect(200);
  }
  async function finalize(c: Execution) {
    await http()
      .post(`${play(c)}/finalize`)
      .send({ endingType: 'OBJECTIVE_COMPLETED' })
      .expect(200);
    expect((await state(c)).progress).toBe(100);
    expect(
      (await http().get(library).expect(200)).body.sessions
        .slice(1)
        .map((s: { status: string }) => s.status),
    ).toEqual(Array(6).fill('LOCKED'));
  }

  beforeAll(async () => {
    const current = gloamhaleVersion(gloamhaleV5);
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GLOAMHALE_ADVENTURES)
      .useValue([
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

  it('authorizes one examination after presentation and preserves both Session I routes', async () => {
    const legacy = (
      await http()
        .post('/api/v1/campaigns')
        .send({ title: 'Campanha independente' })
        .expect(201)
    ).body;
    expect(
      await pinnedSceneObjects(legacy.id, db.db, app.get(AdventureRegistry)),
    ).toBeNull();
    const { body: opened } = await http().post(library).expect(200);
    const run = { campaignId: opened.campaignId, sessionId: opened.session.id };
    expect(
      (
        await pinnedSceneObjects(
          run.campaignId,
          db.db,
          app.get(AdventureRegistry),
        )
      )?.release.revision,
    ).toBe(roadObjects.revision);
    await start(run, ['aren', 'mira', 'lys']);
    expect((await diary(run))[0].content).toBe(
      travelOpening.replace('{{nome_da_personagem}}', 'Naelis'),
    );
    expect((await send(run, 'ACT', 'Examino a carroça.')).content).toMatch(
      /ainda não está identificado/,
    );
    expect(await events(run)).toHaveLength(0);
    expect(JSON.stringify(await diary(run))).not.toMatch(/fios mal escondidos/);

    await advance(run);
    expect((await diary(run)).at(-1).metadata.travelRevealed).toBe(true);
    const observe = await send(run, 'ACT', 'Dou uma olhada na carroça.');
    expect(observe.content).toBe(roadObjects.objects[0]!.perceptible);
    expect(
      await send(
        run,
        'OUT_OF_CHARACTER',
        'Una, o que Naelis consegue observar daqui?',
      ),
    ).toMatchObject({
      content: observe.content,
      metadata: { clarification: true },
    });
    await send(run, 'SPEAK', 'Você sabe de quem é essa carroça?');
    await send(
      run,
      'THINK',
      'Naelis desconfia que existe algo estranho naquela carroça.',
    );
    expect(
      (
        await send(
          run,
          'REQUEST_CHECK',
          'Quero fazer um teste para examinar a carroça.',
        )
      ).content,
    ).toMatch(/Nenhum teste adicional/);
    await send(run, 'ROLL_RESULT', 'Rolei 6, 6 e 6.');
    expect(
      (await send(run, 'ACT', 'Examino a caixa da estrada.')).content,
    ).toMatch(/ainda não está identificado/);
    expect(await events(run)).toHaveLength(0);
    expect((await state(run)).progress).toBe(0);

    const rowsBefore = await diary(run);
    const callsBefore = turn.mock.calls.length;
    await queue(run, 'ACT', 'Quero examinar essa carroça.');
    expect(turn.mock.calls.length).toBe(callsBefore);
    expect(await events(run)).toHaveLength(0);
    expect((await diary(run)).slice(0, -1)).toEqual(rowsBefore);
    const batch = randomUUID();
    await Promise.all([advance(run, batch), advance(run, batch)]);
    const result = (await diary(run)).at(-1);
    expect(result.content).toBe(roadObjects.objects[0]!.examined);
    expect(JSON.stringify(await diary(run))).not.toMatch(
      /chave escondida|armadilha disparou|sinceridade|Empatia/,
    );
    const [event] = await events(run);
    expect(event).toMatchObject({
      visibility: 'PLAYER_ONLY',
      changes: { revision: roadObjects.revision, objectId: expect.any(String) },
    });
    expect(result.metadata.eventIds).toEqual([event!.id]);
    const received = turn.mock.calls.find(
      ([call]) => call.playerMessage === 'Quero examinar essa carroça.',
    )?.[0];
    expect(received?.stage).toBe('NARRATE');
    expect(JSON.stringify(received)).not.toMatch(/amboscada|Empatia|moradores/);
    const internalMessages = await db.db
      .select()
      .from(sessionMessages)
      .where(eq(sessionMessages.sessionId, run.sessionId));
    expect(
      internalMessages.some(
        (row) =>
          row.metadata?.deterministicFallback === true &&
          row.metadata?.renderingValidation === 'UNGROUNDED_INFORMATION',
      ),
    ).toBe(true);
    const protagonist = (await loadAdventure(run.campaignId, db.db))!.instance
      .protagonistId;
    expect(
      await db.db
        .select()
        .from(eventParticipants)
        .where(eq(eventParticipants.eventId, event!.id)),
    ).toMatchObject([{ characterId: protagonist }]);
    expect(
      await db.db
        .select()
        .from(characterKnowledge)
        .where(eq(characterKnowledge.eventId, event!.id)),
    ).toMatchObject([{ characterId: protagonist }]);
    expect(
      await db.db
        .select()
        .from(adventureMemories)
        .where(eq(adventureMemories.eventId, event!.id)),
    ).toEqual([]);

    await http()
      .post(`${play(run)}/pause`)
      .expect(200);
    await http()
      .post(`${play(run)}/resume`)
      .expect(200);
    expect((await diary(run)).at(-1)).toEqual(result);
    expect(
      (await send(run, 'ACT', 'Inspeciono a carroça tombada de perto.'))
        .content,
    ).toBe(roadObjects.objects[0]!.recognized);
    await advance(run, batch);
    expect(await events(run)).toHaveLength(1);
    expect((await state(run)).progress).toBe(0);

    await send(run, 'SPEAK', 'O que aconteceu?');
    await send(run, 'ACT', 'Sigo para Lakesheart.');
    expect(
      (await send(run, 'ACT', 'Quero examinar aquela carroça.')).content,
    ).toMatch(/ainda não está identificado/);
    expect(await events(run)).toHaveLength(1);
    await send(run, 'ACT', 'Decido investigar os desaparecimentos.');
    await finalize(run);

    const next = (
      await http()
        .post(`${play(run)}/reset`)
        .send({ confirm: true })
        .expect(200)
    ).body as Execution;
    expect(await events(run)).toHaveLength(0);
    expect(await diary(next)).toEqual([]);
    await start(next, []);
    expect((await diary(next))[0].content).toBe(
      travelOpening.replace('{{nome_da_personagem}}', 'Naelis'),
    );
    await advance(next);
    expect((await send(next, 'ACT', 'Examino a carroça.')).content).toBe(
      roadObjects.objects[0]!.examined,
    );
    expect((await events(next))[0]?.changes.objectId).not.toBe(
      event!.changes.objectId,
    );
    await send(next, 'SPEAK', 'O que aconteceu?');
    await send(next, 'ACT', 'Escolho seguir diretamente ao pântano.');
    await finalize(next);
    expect(
      await pinnedSceneObjects(legacy.id, db.db, app.get(AdventureRegistry)),
    ).toBeNull();
  });
});
