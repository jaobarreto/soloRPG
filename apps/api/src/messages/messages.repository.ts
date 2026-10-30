import { Injectable } from '@nestjs/common';
import { and, desc, eq, gt } from 'drizzle-orm';
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../database/database.service';
import { sessionMessages } from '../database/schema';

@Injectable()
export class MessagesRepository {
  constructor(private readonly database: DatabaseService) {}
  async lastSequence(
    sessionId: string,
    tx: DatabaseTransaction,
  ): Promise<number> {
    // Caller holds this session's FOR UPDATE lock until the insert commits.
    const [last] = await tx
      .select({ sequence: sessionMessages.sequenceNumber })
      .from(sessionMessages)
      .where(eq(sessionMessages.sessionId, sessionId))
      .orderBy(desc(sessionMessages.sequenceNumber))
      .limit(1);
    return last?.sequence ?? 0;
  }
  async insert(
    values: typeof sessionMessages.$inferInsert,
    tx: DatabaseTransaction,
  ) {
    const [message] = await tx
      .insert(sessionMessages)
      .values(values)
      .returning();
    if (!message) throw new Error('Message insert did not return a record');
    return message;
  }
  page(campaignId: string, sessionId: string, after: number, limit: number) {
    return this.database.db
      .select()
      .from(sessionMessages)
      .where(
        and(
          eq(sessionMessages.campaignId, campaignId),
          eq(sessionMessages.sessionId, sessionId),
          gt(sessionMessages.sequenceNumber, after),
        ),
      )
      .orderBy(sessionMessages.sequenceNumber)
      .limit(limit + 1);
  }
}
