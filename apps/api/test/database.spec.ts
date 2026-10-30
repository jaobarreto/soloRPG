import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../src/database/database.service';

describe('database connection lifecycle', () => {
  it('propagates a connection failure and closes the pool cleanly', async () => {
    const service = new DatabaseService(
      new ConfigService({
        DATABASE_URL: 'postgresql://test:test@127.0.0.1:1/test',
        HEALTH_TIMEOUT_MS: 100,
      }),
    );
    try {
      await expect(service.checkHealth()).rejects.toThrow();
    } finally {
      await expect(service.onModuleDestroy()).resolves.toBeUndefined();
    }
  });
});
