import { pgTable, serial, text, uuid } from 'drizzle-orm/pg-core';

// Only reset identities and editorial revisions survive deletion of an execution.
export const librarySessionResets = pgTable('library_session_resets', {
  sequence: serial('sequence').primaryKey(),
  slotId: uuid('slot_id').notNull(),
  previousCampaignId: uuid('previous_campaign_id').notNull().unique(),
  previousSessionId: uuid('previous_session_id').notNull(),
  replacementCampaignId: uuid('replacement_campaign_id').notNull().unique(),
  replacementSessionId: uuid('replacement_session_id').notNull(),
  previousPlanning: text('previous_planning'),
  previousOpening: text('previous_opening'),
  replacementPlanning: text('replacement_planning'),
  replacementOpening: text('replacement_opening').notNull(),
});
