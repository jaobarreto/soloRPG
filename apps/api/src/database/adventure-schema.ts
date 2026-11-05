import {
  foreignKey,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uuid,
  boolean,
  integer,
} from 'drizzle-orm/pg-core';
import { campaigns, campaignSessions } from './schema';
import { characters, gameEvents } from './game-schema';
import type { AdventureDefinition } from '../adventures/core/definitions/definition';

// Server-only reference material. No public controller serializes these tables.
export const adventureDefinitions = pgTable('adventure_definitions', {
  id: text('id').primaryKey(),
  digest: text('digest').notNull(),
  definition: jsonb('definition').$type<AdventureDefinition>().notNull(),
});
export const adventureInstances = pgTable(
  'adventure_instances',
  {
    campaignId: uuid('campaign_id')
      .primaryKey()
      .references(() => campaigns.id, { onDelete: 'restrict' }),
    definitionId: text('definition_id')
      .notNull()
      .references(() => adventureDefinitions.id, { onDelete: 'restrict' }),
    entityNamespace: text('entity_namespace').notNull().default('adventure'),
    narrativeMinutes: integer('narrative_minutes').notNull().default(0),
    protagonistId: uuid('protagonist_id'),
    reviewedDigest: text('reviewed_digest'),
    reviewNotes: text('review_notes'),
    mechanics: jsonb('mechanics').$type<Record<string, unknown>>(),
  },
  (t) => [
    foreignKey({
      columns: [t.protagonistId, t.campaignId],
      foreignColumns: [characters.id, characters.campaignId],
    }).onDelete('restrict'),
  ],
);
export const adventureCast = pgTable(
  'adventure_cast',
  {
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => adventureInstances.campaignId, {
        onDelete: 'restrict',
      }),
    key: text('key').notNull(),
    known: boolean('known').notNull().default(false),
    currentState: text('current_state')
      .notNull()
      .default('Sem alterações confirmadas.'),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.key] })],
);
export const adventureScenes = pgTable(
  'adventure_scenes',
  {
    campaignId: uuid('campaign_id').notNull(),
    sessionId: uuid('session_id').primaryKey(),
    sceneKey: text('scene_key').notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.sessionId, t.campaignId],
      foreignColumns: [campaignSessions.id, campaignSessions.campaignId],
    }).onDelete('restrict'),
  ],
);
export const adventureMemories = pgTable(
  'adventure_memories',
  {
    campaignId: uuid('campaign_id').notNull(),
    characterKey: text('character_key').notNull(),
    eventId: uuid('event_id').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.campaignId, t.characterKey, t.eventId] }),
    foreignKey({
      columns: [t.campaignId, t.characterKey],
      foreignColumns: [adventureCast.campaignId, adventureCast.key],
    }).onDelete('restrict'),
    foreignKey({
      columns: [t.eventId, t.campaignId],
      foreignColumns: [gameEvents.id, gameEvents.campaignId],
    }).onDelete('restrict'),
  ],
);
export const adventureReviews = pgTable(
  'adventure_reviews',
  {
    campaignId: uuid('campaign_id').notNull(),
    sessionId: uuid('session_id').primaryKey(),
    sessionNumber: integer('session_number').notNull(),
    eventIds: jsonb('event_ids').$type<string[]>().notNull(),
    reason: text('reason').notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.sessionId, t.campaignId],
      foreignColumns: [campaignSessions.id, campaignSessions.campaignId],
    }).onDelete('restrict'),
  ],
);
