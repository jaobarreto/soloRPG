import { Injectable } from '@nestjs/common';
import { and, eq, inArray, ne } from 'drizzle-orm';
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../database/database.service';
import { campaignSessions } from '../database/schema';

@Injectable()
export class SessionsRepository {
  constructor(private readonly database: DatabaseService) {}
  list(campaignId: string) {
    return this.database.db
      .select()
      .from(campaignSessions)
      .where(eq(campaignSessions.campaignId, campaignId))
      .orderBy(campaignSessions.sessionNumber);
  }
  async find(
    campaignId: string,
    id: string,
    tx: DatabaseService['db'] | DatabaseTransaction = this.database.db,
  ) {
    return (
      await tx
        .select()
        .from(campaignSessions)
        .where(
          and(
            eq(campaignSessions.campaignId, campaignId),
            eq(campaignSessions.id, id),
          ),
        )
    )[0];
  }
  async lock(campaignId: string, id: string, tx: DatabaseTransaction) {
    return (
      await tx
        .select()
        .from(campaignSessions)
        .where(
          and(
            eq(campaignSessions.campaignId, campaignId),
            eq(campaignSessions.id, id),
          ),
        )
        .for('update')
    )[0];
  }
  async atNumber(campaignId: string, number: number, tx: DatabaseTransaction) {
    return (
      await tx
        .select()
        .from(campaignSessions)
        .where(
          and(
            eq(campaignSessions.campaignId, campaignId),
            eq(campaignSessions.sessionNumber, number),
          ),
        )
    )[0];
  }
  async findOtherActive(
    campaignId: string,
    id: string,
    tx: DatabaseTransaction,
  ) {
    return (
      await tx
        .select()
        .from(campaignSessions)
        .where(
          and(
            eq(campaignSessions.campaignId, campaignId),
            ne(campaignSessions.id, id),
            inArray(campaignSessions.status, ['IN_PROGRESS', 'PAUSED']),
          ),
        )
    )[0];
  }
  async update(
    id: string,
    values: Partial<typeof campaignSessions.$inferInsert>,
    tx: DatabaseTransaction,
  ) {
    const [session] = await tx
      .update(campaignSessions)
      .set(values)
      .where(eq(campaignSessions.id, id))
      .returning();
    if (!session) throw new Error('Session update did not return a record');
    return session;
  }
}
