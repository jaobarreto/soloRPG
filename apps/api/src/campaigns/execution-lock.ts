import { sql } from 'drizzle-orm';
import type { DatabaseTransaction } from '../database/database.service';

export async function lockExecutionIdentity(
  id: string,
  tx: DatabaseTransaction,
) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${id}, 0))`,
  );
}
