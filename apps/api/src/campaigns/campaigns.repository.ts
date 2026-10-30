import { Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../database/database.service';
import { campaigns, campaignSessions } from '../database/schema';

@Injectable()
export class CampaignsRepository {
  constructor(private readonly database: DatabaseService) {}
  create(
    input: typeof campaigns.$inferInsert,
    plan: Omit<typeof campaignSessions.$inferInsert, 'campaignId'>[],
  ) {
    return this.database.db.transaction(async (tx) => {
      const [campaign] = await tx.insert(campaigns).values(input).returning();
      if (!campaign) throw new Error('Campaign insert did not return a record');
      const sessions = await tx
        .insert(campaignSessions)
        .values(
          plan.map((session) => ({ ...session, campaignId: campaign.id })),
        )
        .returning();
      return {
        campaign,
        sessions: sessions.sort((a, b) => a.sessionNumber - b.sessionNumber),
      };
    });
  }
  list() {
    return this.database.db
      .select()
      .from(campaigns)
      .orderBy(desc(campaigns.createdAt), desc(campaigns.id));
  }
  async find(
    id: string,
    tx: DatabaseService['db'] | DatabaseTransaction = this.database.db,
  ) {
    return (await tx.select().from(campaigns).where(eq(campaigns.id, id)))[0];
  }
  detail(id: string) {
    return this.database.db.transaction(
      async (tx) => {
        const campaign = await this.find(id, tx);
        if (!campaign) return undefined;
        const sessions = await tx
          .select()
          .from(campaignSessions)
          .where(eq(campaignSessions.campaignId, id))
          .orderBy(campaignSessions.sessionNumber);
        return { campaign, sessions };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
  async lock(id: string, tx: DatabaseTransaction) {
    return (
      await tx
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, id))
        .for('update')
    )[0];
  }
  async update(
    id: string,
    values: Partial<typeof campaigns.$inferInsert>,
    tx: DatabaseService['db'] | DatabaseTransaction = this.database.db,
  ) {
    return (
      await tx
        .update(campaigns)
        .set(values)
        .where(eq(campaigns.id, id))
        .returning()
    )[0];
  }
}
