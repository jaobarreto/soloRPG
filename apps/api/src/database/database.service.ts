import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: Pool;
  readonly db;
  constructor(config: ConfigService) {
    const timeout = config.getOrThrow<number>('HEALTH_TIMEOUT_MS');
    this.pool = new Pool({
      connectionString: config.getOrThrow<string>('DATABASE_URL'),
      max: 5,
      connectionTimeoutMillis: timeout,
      query_timeout: timeout,
      statement_timeout: timeout,
    });
    // Idle pool errors must not crash the API or expose connection credentials.
    this.pool.on('error', () => {});
    this.db = drizzle(this.pool);
  }
  async checkHealth(): Promise<void> {
    await this.db.execute(sql`SELECT 1`);
  }
  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

export type DatabaseTransaction = Parameters<
  Parameters<DatabaseService['db']['transaction']>[0]
>[0];
