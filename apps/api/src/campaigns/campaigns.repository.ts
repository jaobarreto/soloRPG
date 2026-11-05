import { pinSceneObjects } from '../adventures/core/objects/scene-objects';
import { planningReceiptId } from '../adventures/core/director/planning';
import { digest } from '../adventures/core/state/identity';
import { gameCommands } from '../database/game-schema';
import { importAdventure } from '../adventures/core/definitions/import';
import type { AdventureModuleDefinition } from '../adventures/core/registry/registry';
import { ConflictException, Injectable } from '@nestjs/common';
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
    adventure?: AdventureModuleDefinition,
  ) {
    return this.database.db.transaction((tx) =>
      this.createInTransaction(input, plan, tx, adventure),
    );
  }
  async createInTransaction(
    input: typeof campaigns.$inferInsert,
    plan: Omit<typeof campaignSessions.$inferInsert, 'campaignId'>[],
    tx: DatabaseTransaction,
    adventure?: AdventureModuleDefinition,
    guided = false,
  ) {
    const [created] = await tx
      .insert(campaigns)
      .values(input)
      .onConflictDoNothing({ target: campaigns.id })
      .returning();
    const campaign = created ?? (input.id && (await this.lock(input.id, tx)));
    if (!campaign) throw new Error('Campaign insert did not return a record');
    if (
      !created &&
      (campaign.title !== input.title ||
        campaign.description !== (input.description ?? null))
    )
      throw new ConflictException(
        'Este pedido de criação já foi usado com outros dados.',
      );
    if (adventure || !created) {
      if (adventure && created) {
        await importAdventure(
          campaign.id,
          campaign.status,
          adventure.definition,
          adventure.entityNamespace,
          tx,
        );
        const release = adventure.guidedRelease;
        const planning = release?.planning;
        if (planning && guided)
          await tx.insert(gameCommands).values({
            campaignId: campaign.id,
            commandId: planningReceiptId(campaign.id),
            digest: digest(planning),
            result: planning,
          });
        const objects = release?.sceneObjects?.[0];
        if (guided && objects) await pinSceneObjects(campaign.id, objects, tx);
      }
      const sessions = await tx
        .select()
        .from(campaignSessions)
        .where(eq(campaignSessions.campaignId, campaign.id))
        .orderBy(campaignSessions.sessionNumber);
      return { campaign, sessions };
    }
    const sessions = await tx
      .insert(campaignSessions)
      .values(plan.map((session) => ({ ...session, campaignId: campaign.id })))
      .returning();
    return {
      campaign,
      sessions: sessions.sort((a, b) => a.sessionNumber - b.sessionNumber),
    };
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
      (tx) => this.detailInTransaction(id, tx),
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
  async detailInTransaction(id: string, tx: DatabaseTransaction) {
    const campaign = await this.find(id, tx);
    if (!campaign) return undefined;
    const sessions = await tx
      .select()
      .from(campaignSessions)
      .where(eq(campaignSessions.campaignId, id))
      .orderBy(campaignSessions.sessionNumber);
    return { campaign, sessions };
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
