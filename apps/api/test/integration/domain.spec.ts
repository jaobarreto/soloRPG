import { execFileSync } from 'node:child_process';
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { sql } from 'drizzle-orm';
import { AppModule } from '../../src/app.module';
import { DatabaseService } from '../../src/database/database.service';
import { configureApp } from '../../src/configure-app';
import type {
  CampaignDetail,
  CampaignSession,
  MessagePage,
} from '@solo-rpg/shared-contracts';

const root = '/api/v1/campaigns';
describe('campaigns / sessions / persistent chat (real PostgreSQL)', () => {
  let app: INestApplication;
  let database: DatabaseService;
  const boot = async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    database = app.get(DatabaseService);
  };
  const create = async (plannedSessions = 8): Promise<CampaignDetail> => {
    const response = await request(app.getHttpServer())
      .post(root)
      .send({ title: 'Os Ecos da Montanha', plannedSessions })
      .expect(201);
    return response.body;
  };
  const path = (campaign: CampaignDetail, index = 0) =>
    `${root}/${campaign.id}/sessions/${campaign.sessions[index]!.id}`;
  const change = (url: string, action: string) =>
    request(app.getHttpServer())
      .post(`${url}/${action}`)
      .send(action === 'complete' ? { endingType: 'PLAYER_REQUESTED' } : {});
  const send = (url: string, content = 'Olá, Theron.') =>
    request(app.getHttpServer())
      .post(`${url}/messages`)
      .send({ interactionMode: 'SPEAK', content });
  const history = async (url: string): Promise<MessagePage['data']> => {
    const messages: MessagePage['data'] = [];
    let cursor = 0;
    for (;;) {
      const response = await request(app.getHttpServer())
        .get(`${url}/messages?limit=3&after=${cursor}`)
        .expect(200);
      const page: MessagePage = response.body;
      messages.push(...page.data);
      if (!page.hasMore) {
        expect(page.nextCursor).toBeNull();
        break;
      }
      expect(page.nextCursor).toBeGreaterThan(cursor);
      cursor = page.nextCursor!;
    }
    return messages;
  };
  beforeAll(async () => {
    if (!process.env.INTEGRATION_DATABASE_URL)
      throw new Error(
        'Use pnpm test:integration to provision an isolated database',
      );
    process.env.DATABASE_URL = process.env.INTEGRATION_DATABASE_URL;
    await boot();
    await migrate(database.db, { migrationsFolder: resolve('drizzle') });
    await migrate(database.db, { migrationsFolder: resolve('drizzle') });
  });
  afterAll(async () => {
    if (app) await app.close();
  });

  it('creates eight sessions, lists, reads and edits only public campaign fields', async () => {
    const c = await create();
    expect(c.status).toBe('DRAFT');
    expect(c.currentSessionNumber).toBeNull();
    expect(c.defaultSessionDurationMinutes).toBe(120);
    expect(c.sessions).toHaveLength(8);
    expect(c.sessions.map((s) => s.sessionNumber)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    expect(c.sessions.map((s) => s.status)).toEqual([
      'AVAILABLE',
      ...Array(7).fill('LOCKED'),
    ]);
    const list = await request(app.getHttpServer()).get(root).expect(200);
    expect(list.body.some((item: { id: string }) => item.id === c.id)).toBe(
      true,
    );
    await request(app.getHttpServer())
      .get(`${root}/${randomUUID()}`)
      .expect(404);
    await request(app.getHttpServer())
      .patch(`${root}/${c.id}`)
      .send({ title: 'Novo título', description: null })
      .expect(200);
    const detail = await request(app.getHttpServer())
      .get(`${root}/${c.id}`)
      .expect(200);
    expect(detail.body.title).toBe('Novo título');
    expect(detail.body.description).toBeNull();
    await request(app.getHttpServer())
      .get(`${root}/${c.id}/sessions`)
      .expect(200);
    await request(app.getHttpServer()).get(path(c)).expect(200);
    await request(app.getHttpServer())
      .patch(`${root}/${c.id}`)
      .send({ plannedSessions: 9 })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`${root}/${randomUUID()}`)
      .send({ title: 'Title' })
      .expect(404);
  });
  it.each([
    {},
    { title: '' },
    { title: '   ' },
    { title: 'a', plannedSessions: 0 },
    { title: 'a', plannedSessions: -1 },
    { title: 'a', plannedSessions: 1.2 },
    { title: 'a', plannedSessions: null },
    { title: 'a', defaultSessionDurationMinutes: 0 },
    { title: 'a', status: 'ACTIVE' },
  ])('rejects invalid campaign payload %j', async (body) => {
    await request(app.getHttpServer()).post(root).send(body).expect(400);
  });
  it('rolls back campaign and sessions together if planning fails', async () => {
    // A test-only database trigger injects a failure on the second session.
    await database.db.execute(
      sql`CREATE FUNCTION reject_test_plan() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.session_number = 2 THEN RAISE EXCEPTION 'injected plan failure'; END IF; RETURN NEW; END $$`,
    );
    await database.db.execute(
      sql`CREATE TRIGGER reject_test_plan BEFORE INSERT ON campaign_sessions FOR EACH ROW EXECUTE FUNCTION reject_test_plan()`,
    );
    const before = await request(app.getHttpServer()).get(root);
    try {
      await request(app.getHttpServer())
        .post(root)
        .send({ title: 'rollback' })
        .expect(500);
      const after = await request(app.getHttpServer()).get(root);
      expect(after.body).toHaveLength(before.body.length);
    } finally {
      await database.db.execute(
        sql`DROP TRIGGER reject_test_plan ON campaign_sessions`,
      );
      await database.db.execute(sql`DROP FUNCTION reject_test_plan()`);
    }
  });
  it('serializes starts, enforces predecessor, rejects repeats, accounts time once, finishes campaign', async () => {
    const c = await create(2);
    await change(path(c, 1), 'start').expect(409);
    const starts = await Promise.all([
      change(path(c), 'start'),
      change(path(c), 'start'),
    ]);
    expect(starts.map((r) => r.status).sort()).toEqual([200, 409]);
    const campaign = await request(app.getHttpServer()).get(`${root}/${c.id}`);
    expect(campaign.body.status).toBe('ACTIVE');
    expect(campaign.body.currentSessionNumber).toBe(1);
    await database.db.execute(
      sql`UPDATE campaign_sessions SET resumed_at = now() - interval '60 seconds' WHERE id = ${c.sessions[0]!.id}`,
    );
    const paused = await change(path(c), 'pause').expect(200);
    expect(paused.body.activeDurationSeconds).toBeGreaterThanOrEqual(60);
    expect(paused.body.resumedAt).toBeNull();
    await change(path(c), 'pause').expect(409);
    await change(path(c, 1), 'start').expect(409);
    const resumed = await change(path(c), 'resume').expect(200);
    expect(resumed.body.activeDurationSeconds).toBe(
      paused.body.activeDurationSeconds,
    );
    await change(path(c), 'resume').expect(409);
    const ends = await Promise.all([
      change(path(c), 'complete'),
      change(path(c), 'complete'),
    ]);
    expect(ends.map((r) => r.status).sort()).toEqual([200, 409]);
    await change(path(c), 'start').expect(409);
    const next = await change(path(c, 1), 'start').expect(200);
    expect(next.body.status).toBe('IN_PROGRESS');
    await change(path(c, 1), 'pause').expect(200);
    await change(path(c, 1), 'complete').expect(200);
    const finished = await request(app.getHttpServer())
      .get(`${root}/${c.id}`)
      .expect(200);
    expect(finished.body.status).toBe('COMPLETED');
    expect(finished.body.completedAt).not.toBeNull();
    expect(finished.body.sessions).toHaveLength(2);
    expect(
      finished.body.sessions.every((s: CampaignSession) => s.summary === null),
    ).toBe(true);
  });
  it('rejects invalid messages, role spoofing, wrong campaign, invalid IDs/cursors and transitions', async () => {
    const c = await create(2);
    const other = await create(1);
    const url = path(c);
    await send(url).expect(409);
    await send(path(c, 1)).expect(409);
    await change(url, 'start').expect(200);
    for (const content of ['', '  ', 'x'.repeat(10001)])
      await send(url, content).expect(400);
    await request(app.getHttpServer())
      .post(`${url}/messages`)
      .send({ content: 'hello', interactionMode: 'SPEAK', role: 'GAME_MASTER' })
      .expect(400);
    await request(app.getHttpServer())
      .post(`${url}/messages`)
      .send({ content: 'hello', interactionMode: 'INVALID' })
      .expect(400);
    await request(app.getHttpServer())
      .post(`${url}/complete`)
      .send({ endingType: 'INVALID' })
      .expect(400);
    await request(app.getHttpServer())
      .get(`${url}/messages?limit=0`)
      .expect(400);
    await request(app.getHttpServer())
      .get(`${url}/messages?after=-1`)
      .expect(400);
    await request(app.getHttpServer())
      .get(`${url}/messages?after=1.2`)
      .expect(400);
    await request(app.getHttpServer())
      .get(`${url}/messages?limit=101`)
      .expect(400);
    await request(app.getHttpServer()).get(`${root}/invalid`).expect(400);
    const wrong = `${root}/${other.id}/sessions/${c.sessions[0]!.id}`;
    await change(wrong, 'start').expect(404);
    await send(wrong).expect(404);
    await request(app.getHttpServer()).get(`${wrong}/messages`).expect(404);
    await request(app.getHttpServer()).get(wrong).expect(404);
    await change(
      `${root}/${randomUUID()}/sessions/${randomUUID()}`,
      'start',
    ).expect(404);
    await send(`${root}/${randomUUID()}/sessions/${randomUUID()}`).expect(404);
    await request(app.getHttpServer())
      .get(`${root}/${randomUUID()}/sessions`)
      .expect(404);
    await change(url, 'pause').expect(200);
    await send(url).expect(409);
    await change(url, 'complete').expect(200);
    await send(url).expect(409);
    await change(url, 'resume').expect(409);
  });
  it('serializes different session starts even if another available session is introduced', async () => {
    const c = await create(2);
    await database.db.execute(
      sql`UPDATE campaign_sessions SET status = 'AVAILABLE' WHERE id = ${c.sessions[1]!.id}`,
    );
    const results = await Promise.all([
      change(path(c), 'start'),
      change(path(c, 1), 'start'),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const sessions = await request(app.getHttpServer()).get(
      `${root}/${c.id}/sessions`,
    );
    expect(
      sessions.body.filter((s: CampaignSession) => s.status === 'IN_PROGRESS'),
    ).toHaveLength(1);
  });
  it('rolls back completion if the next planned session is missing', async () => {
    const c = await create(2);
    const url = path(c);
    await change(url, 'start').expect(200);
    await database.db.execute(
      sql`DELETE FROM campaign_sessions WHERE id = ${c.sessions[1]!.id}`,
    );
    await change(url, 'complete').expect(409);
    const current = await request(app.getHttpServer()).get(url).expect(200);
    expect(current.body.status).toBe('IN_PROGRESS');
    expect(current.body.completedAt).toBeNull();
  });
  it('allocates concurrent sequence numbers and serializes message vs completion', async () => {
    const c = await create(1);
    const url = path(c);
    await change(url, 'start').expect(200);
    const replies = await Promise.all(
      Array.from({ length: 20 }, (_, i) => send(url, `Mensagem ${i}`)),
    );
    expect(replies.every((r) => r.status === 201)).toBe(true);
    const messages = await history(url);
    expect(messages.map((m) => m.sequenceNumber)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
    const [message, end] = await Promise.all([
      send(url, 'última'),
      change(url, 'complete'),
    ]);
    expect(end.status).toBe(200);
    expect([201, 409]).toContain(message.status);
    expect(await history(url)).toHaveLength(message.status === 201 ? 21 : 20);
    await send(url).expect(409);
  });
  it('preserves all eight messages through pause/resume, next session and API restart', async () => {
    const c = await create(2);
    const first = path(c);
    const second = path(c, 1);
    await change(first, 'start').expect(200);
    for (let i = 1; i <= 5; i++) await send(first, `Mensagem ${i}`).expect(201);
    await change(first, 'pause').expect(200);
    await change(first, 'resume').expect(200);
    for (let i = 6; i <= 8; i++) await send(first, `Mensagem ${i}`).expect(201);
    const original = await history(first);
    await change(first, 'complete').expect(200);
    await change(second, 'start').expect(200);
    expect(await history(second)).toEqual([]);
    await send(second, 'Novo capítulo').expect(201);
    await app.close();
    await boot();
    expect(await history(first)).toEqual(original);
    await app.close();
    const container = process.env.INTEGRATION_CONTAINER;
    if (!container?.startsWith('solorpg-test-'))
      throw new Error('Missing isolated test container');
    execFileSync('docker', ['restart', container], { stdio: 'ignore' });
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        execFileSync(
          'docker',
          ['exec', container, 'pg_isready', '-U', 'test', '-d', 'solorpg_test'],
          { stdio: 'ignore' },
        );
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    const published = execFileSync('docker', ['port', container, '5432/tcp'], {
      encoding: 'utf8',
    })
      .trim()
      .split(':')
      .at(-1);
    expect(published).toBe(new URL(process.env.INTEGRATION_DATABASE_URL!).port);
    await boot();
    await database.checkHealth();
    expect(await history(first)).toEqual(original);
    expect(original.map((m) => m.content)).toEqual(
      Array.from({ length: 8 }, (_, i) => `Mensagem ${i + 1}`),
    );
    expect(original.every((m) => m.role === 'PLAYER')).toBe(true);
    expect((await history(second))[0]!.sequenceNumber).toBe(1);
    const current = await request(app.getHttpServer()).get(`${root}/${c.id}`);
    expect(current.body.currentSessionNumber).toBe(2);
  });
  it('database constraints reject inconsistent campaign references, duplicate sequences and deleting history', async () => {
    const c = await create(1);
    const other = await create(1);
    const url = path(c);
    await change(url, 'start').expect(200);
    await send(url).expect(201);
    await expect(
      database.db.execute(
        sql`INSERT INTO session_messages(campaign_id,session_id,role,content,sequence_number) VALUES (${other.id},${c.sessions[0]!.id},'PLAYER','wrong',2)`,
      ),
    ).rejects.toThrow();
    await expect(
      database.db.execute(
        sql`INSERT INTO session_messages(campaign_id,session_id,role,content,sequence_number) VALUES (${c.id},${c.sessions[0]!.id},'PLAYER','duplicate',1)`,
      ),
    ).rejects.toThrow();
    await expect(
      database.db.execute(
        sql`DELETE FROM campaign_sessions WHERE id = ${c.sessions[0]!.id}`,
      ),
    ).rejects.toThrow();
    await expect(
      database.db.execute(sql`DELETE FROM campaigns WHERE id = ${c.id}`),
    ).rejects.toThrow();
  });
});
