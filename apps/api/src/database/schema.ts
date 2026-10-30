import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const campaignStatus = pgEnum('campaign_status', [
  'DRAFT',
  'ACTIVE',
  'COMPLETED',
]);
export const sessionStatus = pgEnum('session_status', [
  'LOCKED',
  'AVAILABLE',
  'IN_PROGRESS',
  'PAUSED',
  'COMPLETED',
]);
export const endingType = pgEnum('ending_type', [
  'OBJECTIVE_COMPLETED',
  'NARRATIVE_PAUSE',
  'PLAYER_REQUESTED',
]);
export const messageRole = pgEnum('message_role', [
  'PLAYER',
  'GAME_MASTER',
  'SYSTEM',
]);
export const interactionMode = pgEnum('interaction_mode', [
  'SPEAK',
  'ACT',
  'THINK',
  'OUT_OF_CHARACTER',
]);
const timestamps = () => ({
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const campaigns = pgTable(
  'campaigns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    description: text('description'),
    plannedSessions: integer('planned_sessions').notNull().default(8),
    defaultSessionDurationMinutes: integer('default_session_duration_minutes')
      .notNull()
      .default(120),
    currentSessionNumber: integer('current_session_number'),
    status: campaignStatus('status').notNull().default('DRAFT'),
    ...timestamps(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    check('campaign_title_nonempty', sql`length(btrim(${t.title})) > 0`),
    check('campaign_planned_positive', sql`${t.plannedSessions} > 0`),
    check(
      'campaign_duration_positive',
      sql`${t.defaultSessionDurationMinutes} > 0`,
    ),
    check(
      'campaign_current_in_range',
      sql`${t.currentSessionNumber} BETWEEN 1 AND ${t.plannedSessions}`,
    ),
    index('campaigns_created_idx').on(t.createdAt, t.id),
  ],
);
export const campaignSessions = pgTable(
  'campaign_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'restrict' }),
    sessionNumber: integer('session_number').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    status: sessionStatus('status').notNull().default('LOCKED'),
    estimatedDurationMinutes: integer('estimated_duration_minutes')
      .notNull()
      .default(120),
    activeDurationSeconds: integer('active_duration_seconds')
      .notNull()
      .default(0),
    startedAt: timestamp('started_at', { withTimezone: true }),
    resumedAt: timestamp('resumed_at', { withTimezone: true }),
    pausedAt: timestamp('paused_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    endingType: endingType('ending_type'),
    summary: text('summary'),
    ...timestamps(),
  },
  (t) => [
    unique('sessions_campaign_number_unique').on(t.campaignId, t.sessionNumber),
    unique('sessions_id_campaign_unique').on(t.id, t.campaignId),
    uniqueIndex('sessions_one_running_per_campaign')
      .on(t.campaignId)
      .where(sql`${t.status} IN ('IN_PROGRESS', 'PAUSED')`),
    check('session_number_positive', sql`${t.sessionNumber} > 0`),
    check('session_duration_positive', sql`${t.estimatedDurationMinutes} > 0`),
    check('session_active_nonnegative', sql`${t.activeDurationSeconds} >= 0`),
    check('session_title_nonempty', sql`length(btrim(${t.title})) > 0`),
    check(
      'session_running_clock',
      sql`(${t.status} = 'IN_PROGRESS') = (${t.resumedAt} IS NOT NULL)`,
    ),
    check(
      'session_completed_fields',
      sql`(${t.status} = 'COMPLETED') = (${t.completedAt} IS NOT NULL AND ${t.endingType} IS NOT NULL)`,
    ),
  ],
);
export const sessionMessages = pgTable(
  'session_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'restrict' }),
    sessionId: uuid('session_id').notNull(),
    role: messageRole('role').notNull(),
    interactionMode: interactionMode('interaction_mode'),
    content: text('content').notNull(),
    sequenceNumber: integer('sequence_number').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'messages_session_campaign_fk',
      columns: [t.sessionId, t.campaignId],
      foreignColumns: [campaignSessions.id, campaignSessions.campaignId],
    }).onDelete('restrict'),
    unique('messages_session_sequence_unique').on(
      t.sessionId,
      t.sequenceNumber,
    ),
    check('message_content_nonempty', sql`length(btrim(${t.content})) > 0`),
    check('message_sequence_positive', sql`${t.sequenceNumber} > 0`),
    index('messages_campaign_created_idx').on(t.campaignId, t.createdAt),
  ],
);
export type CampaignRecord = typeof campaigns.$inferSelect;
export type SessionRecord = typeof campaignSessions.$inferSelect;
export type MessageRecord = typeof sessionMessages.$inferSelect;
