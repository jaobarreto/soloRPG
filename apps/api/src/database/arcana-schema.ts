import {
  boolean,
  foreignKey,
  jsonb,
  pgTable,
  text,
  uuid,
} from 'drizzle-orm/pg-core';
import { campaigns, campaignSessions } from './schema';
import { characters } from './game-schema';
import type { ArcaneContext } from '@solo-rpg/shared-contracts';
export const arcaneContexts = pgTable(
  'arcane_contexts',
  {
    id: uuid('id').primaryKey(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'restrict' }),
    sessionId: uuid('session_id').notNull(),
    characterId: uuid('character_id').notNull(),
    preparedFor: text('prepared_for').notNull().default('UNSCOPED'),
    value: jsonb('value').$type<ArcaneContext>().notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.sessionId, t.campaignId],
      foreignColumns: [campaignSessions.id, campaignSessions.campaignId],
    }).onDelete('restrict'),
    foreignKey({
      columns: [t.characterId, t.campaignId],
      foreignColumns: [characters.id, characters.campaignId],
    }).onDelete('restrict'),
  ],
);
export const arcaneEffects = pgTable(
  'arcane_effects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'restrict' }),
    characterId: uuid('character_id').notNull(),
    targetId: uuid('target_id').notNull(),
    arcanum: text('arcanum').notNull(),
    active: boolean('active').notNull().default(true),
    sustained: boolean('sustained').notNull(),
    value: jsonb('value').$type<Record<string, unknown>>().notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.characterId, t.campaignId],
      foreignColumns: [characters.id, characters.campaignId],
    }).onDelete('restrict'),
    foreignKey({
      columns: [t.targetId, t.campaignId],
      foreignColumns: [characters.id, characters.campaignId],
    }).onDelete('restrict'),
  ],
);
