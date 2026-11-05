import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { campaigns, campaignSessions, sessionMessages } from './schema';
import { characters, gameEvents } from './game-schema';
import {
  actionStatuses,
  type ScenePlan,
  type NarrativeProposal,
} from '@solo-rpg/shared-contracts';
const time = () =>
  timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
export const narrativeActions = pgTable(
  'narrative_actions',
  {
    id: uuid('id').primaryKey(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'restrict' }),
    sessionId: uuid('session_id').notNull(),
    digest: text('digest').notNull(),
    status: text('status', { enum: actionStatuses })
      .notNull()
      .default('PENDING'),
    playerMessageId: uuid('player_message_id')
      .notNull()
      .references(() => sessionMessages.id, { onDelete: 'restrict' }),
    masterMessageId: uuid('master_message_id').references(
      () => sessionMessages.id,
      { onDelete: 'restrict' },
    ),
    revision: text('revision'),
    proposal: jsonb('proposal').$type<NarrativeProposal>(),
    // Authorized, immutable post-commit projection, independent of the provider.
    confirmed: jsonb('confirmed').$type<{
      narrative: string;
      eventIds: string[];
    }>(),
    requestId: uuid('request_id'),
    optionId: uuid('option_id'),
    success: boolean('success'),
    leaseToken: uuid('lease_token'),
    leaseUntil: timestamp('lease_until', { withTimezone: true }),
    error: text('error'),
    createdAt: time(),
  },
  (t) => [
    foreignKey({
      columns: [t.sessionId, t.campaignId],
      foreignColumns: [campaignSessions.id, campaignSessions.campaignId],
    }).onDelete('restrict'),
    uniqueIndex('one_pending_narrative_per_campaign')
      .on(t.campaignId)
      .where(sql`${t.status} NOT IN ('COMPLETED','REJECTED')`),
    uniqueIndex('narrative_player_message_unique').on(t.playerMessageId),
    uniqueIndex('narrative_master_message_unique').on(t.masterMessageId),
    check(
      'narrative_status_valid',
      sql`${t.status} IN ('PENDING','AWAITING_ROLL','AWAITING_STUNTS','COMMITTED','COMPLETED','REJECTED')`,
    ),
    index('narrative_session_idx').on(t.sessionId, t.createdAt),
  ],
);
export const sessionPlans = pgTable(
  'narrative_session_plans',
  {
    sessionId: uuid('session_id').primaryKey(),
    campaignId: uuid('campaign_id').notNull(),
    plan: jsonb('plan').$type<ScenePlan>().notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.sessionId, t.campaignId],
      foreignColumns: [campaignSessions.id, campaignSessions.campaignId],
    }).onDelete('restrict'),
  ],
);
export const characterKnowledge = pgTable(
  'character_knowledge',
  {
    campaignId: uuid('campaign_id').notNull(),
    characterId: uuid('character_id').notNull(),
    eventId: uuid('event_id').notNull(),
    source: text('source').notNull(),
    importance: integer('importance').notNull().default(50),
    createdAt: time(),
  },
  (t) => [
    primaryKey({ columns: [t.characterId, t.eventId] }),
    foreignKey({
      columns: [t.characterId, t.campaignId],
      foreignColumns: [characters.id, characters.campaignId],
    }).onDelete('restrict'),
    foreignKey({
      columns: [t.eventId, t.campaignId],
      foreignColumns: [gameEvents.id, gameEvents.campaignId],
    }).onDelete('restrict'),
    check('knowledge_importance', sql`${t.importance} BETWEEN 0 AND 100`),
  ],
);
export const aiUsage = pgTable('ai_usage', {
  id: uuid('id').primaryKey().defaultRandom(),
  actionId: uuid('action_id')
    .notNull()
    .references(() => narrativeActions.id, { onDelete: 'restrict' }),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  inputTokens: integer('input_tokens').notNull(),
  outputTokens: integer('output_tokens').notNull(),
  durationMs: integer('duration_ms').notNull(),
  inputCharacters: integer('input_characters').notNull().default(0),
  totalTokens: integer('total_tokens'),
  usageReported: boolean('usage_reported').notNull().default(false),
  stage: text('stage', { enum: ['PROPOSE', 'NARRATE'] }),
  error: text('error'),
  createdAt: time(),
});
