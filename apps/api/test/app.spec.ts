import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { DatabaseService } from '../src/database/database.service';
import { AiServiceClient } from '../src/integrations/ai-service/ai-service.client';
describe('AppModule HTTP', () => {
  let app: INestApplication;
  const database = { checkHealth: jest.fn(), onModuleDestroy: jest.fn() };
  const ai = { checkHealth: jest.fn() };
  beforeAll(async () => {
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
    process.env.AI_SERVICE_URL = 'http://localhost:8000';
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DatabaseService)
      .useValue(database)
      .overrideProvider(AiServiceClient)
      .useValue(ai)
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    database.checkHealth.mockResolvedValue(undefined);
    ai.checkHealth.mockResolvedValue({ status: 'ok', service: 'solo-rpg-ai' });
  });
  it('boots and exposes liveness', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200, { status: 'ok', service: 'solo-rpg-api' });
  });
  it('checks database readiness', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/health/database')
      .expect(200, { status: 'ok', service: 'postgresql' });
    expect(database.checkHealth).toHaveBeenCalled();
  });
  it('checks AI readiness', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/health/ai-service')
      .expect(200, { status: 'ok', service: 'solo-rpg-ai' });
  });
  it.each(['database', 'ai-service'])(
    'returns 503 when %s is unavailable',
    async (dependency) => {
      (dependency === 'database' ? database : ai).checkHealth.mockRejectedValue(
        new Error('private credentials must not leak'),
      );
      const response = await request(app.getHttpServer())
        .get(`/api/v1/health/${dependency}`)
        .expect(503);
      expect(response.body.status).toBe('error');
      expect(JSON.stringify(response.body)).not.toContain(
        'private credentials',
      );
    },
  );
  it('serves Swagger', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/docs-json')
      .expect(200);
    expect(response.body.paths['/api/v1/health']).toBeDefined();
  });
});
