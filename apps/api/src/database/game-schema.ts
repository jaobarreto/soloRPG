import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { campaigns, campaignSessions } from './schema';
import {
  abilities,
  characterKinds,
  weaponRuleIds,
} from '@solo-rpg/shared-contracts';
export const diceVisibility = pgEnum('dice_visibility', [
  'PUBLIC',
  'PLAYER_ONLY',
  'GM_ONLY',
]);
export const blueRoseAbility = pgEnum('blue_rose_ability', abilities);
export const characterKind = pgEnum('character_kind', characterKinds);
const id = () => uuid('id').primaryKey().defaultRandom();
const campaignId = () =>
  uuid('campaign_id')
    .notNull()
    .references(() => campaigns.id, { onDelete: 'restrict' });
const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
export const ruleReferences = pgTable(
  'blue_rose_rules',
  {
    id: text('id').primaryKey(),
    kind: text('kind', {
      enum: ['FOCUS', 'TALENT', 'SPECIALIZATION', 'ARCANUM', 'STUNT'],
    }).notNull(),
    name: text('name').notNull(),
    status: text('status', {
      enum: ['IMPLEMENTED', 'RECORDED', 'PENDING'],
    }).notNull(),
    source: text('source').notNull(),
    page: text('page').notNull(),
    ability: blueRoseAbility('ability'),
    prerequisites: text('prerequisites'),
    usage: text('usage'),
    cost: text('cost'),
    effect: text('effect'),
    duration: text('duration'),
    limitations: text('limitations'),
  },
  (t) => [
    check(
      'rule_status_valid',
      sql`${t.status} IN ('IMPLEMENTED','RECORDED','PENDING')`,
    ),
    check(
      'rule_kind_valid',
      sql`${t.kind} IN ('FOCUS','TALENT','SPECIALIZATION','ARCANUM','STUNT')`,
    ),
  ],
);
export const characters = pgTable(
  'characters',
  {
    id: id(),
    campaignId: campaignId(),
    kind: characterKind('kind').notNull(),
    known: boolean('known').notNull().default(false),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    people: text('people').notNull(),
    characterClass: text('character_class', {
      enum: ['ADEPT', 'EXPERT', 'WARRIOR'],
    }),
    background: text('background').notNull(),
    level: integer('level').notNull(),
    calling: text('calling').notNull().default(''),
    destiny: text('destiny').notNull().default(''),
    fate: text('fate').notNull().default(''),
    personality: text('personality').notNull().default(''),
    motivations: text('motivations').notNull().default(''),
    state: text('state').notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [
    unique('characters_id_campaign').on(t.id, t.campaignId),
    uniqueIndex('one_protagonist_per_campaign')
      .on(t.campaignId)
      .where(sql`${t.kind} = 'PROTAGONIST'`),
    check('character_level_range', sql`${t.level} BETWEEN 1 AND 20`),
    check('character_name_nonempty', sql`length(btrim(${t.name})) > 0`),
    check(
      'character_class_valid',
      sql`${t.characterClass} IN ('ADEPT','EXPERT','WARRIOR')`,
    ),
    check('protagonist_known', sql`${t.kind} <> 'PROTAGONIST' OR ${t.known}`),
  ],
);
export const characterSecrets = pgTable('character_secrets', {
  characterId: uuid('character_id')
    .primaryKey()
    .references(() => characters.id, { onDelete: 'restrict' }),
  notes: text('notes').notNull().default(''),
  objectives: text('objectives').notNull().default(''),
});
export const characterAbilities = pgTable(
  'character_abilities',
  {
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'restrict' }),
    ability: blueRoseAbility('ability').notNull(),
    score: integer('score').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.characterId, t.ability] }),
    check('ability_storage_bounds', sql`${t.score} BETWEEN -10 AND 30`),
  ],
);
export const characterResources = pgTable(
  'character_resources',
  {
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'restrict' }),
    name: text('name', {
      enum: ['HEALTH', 'CONVICTION', 'CORRUPTION'],
    }).notNull(),
    current: integer('current').notNull(),
    maximum: integer('maximum').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.characterId, t.name] }),
    check(
      'resource_name_valid',
      sql`${t.name} IN ('HEALTH','CONVICTION','CORRUPTION')`,
    ),
    check(
      'resource_bounds',
      sql`${t.current} >= 0 AND ${t.current} <= ${t.maximum} AND ${t.maximum} BETWEEN 0 AND 10000`,
    ),
  ],
);
export const characterFeatures = pgTable(
  'character_features',
  {
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'restrict' }),
    ruleId: text('rule_id')
      .notNull()
      .references(() => ruleReferences.id, { onDelete: 'restrict' }),
    improved: boolean('improved').notNull().default(false),
    degree: text('degree', { enum: ['NOVICE', 'JOURNEYMAN', 'MASTER'] }),
  },
  (t) => [
    primaryKey({ columns: [t.characterId, t.ruleId] }),
    check(
      'feature_degree_valid',
      sql`${t.degree} IN ('NOVICE','JOURNEYMAN','MASTER')`,
    ),
  ],
);
export const characterDetails = pgTable(
  'character_details',
  {
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'restrict' }),
    kind: text('kind', { enum: ['LANGUAGE', 'GOAL'] }).notNull(),
    value: text('value').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.characterId, t.kind, t.value] }),
    check('detail_kind_valid', sql`${t.kind} IN ('LANGUAGE','GOAL')`),
  ],
);
export const characterConditions = pgTable(
  'character_conditions',
  {
    id: id(),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    ruleKey: text('rule_key'),
    description: text('description').notNull(),
    visibility: diceVisibility('visibility').notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique('condition_rule_unique').on(t.characterId, t.ruleKey)],
);
export const weaponRule = pgEnum('blue_rose_weapon_rule', weaponRuleIds);
export const gameItems = pgTable(
  'game_items',
  {
    id: id(),
    campaignId: campaignId(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    consumable: boolean('consumable').notNull().default(false),
    equipmentRuleId: weaponRule('equipment_rule_id'),
    visibility: diceVisibility('visibility').notNull(),
  },
  (t) => [unique('items_id_campaign').on(t.id, t.campaignId)],
);
export const inventory = pgTable(
  'character_inventory',
  {
    campaignId: campaignId(),
    characterId: uuid('character_id').notNull(),
    itemId: uuid('item_id').notNull(),
    quantity: integer('quantity').notNull(),
    equipped: boolean('equipped').notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.characterId, t.itemId] }),
    foreignKey({
      columns: [t.characterId, t.campaignId],
      foreignColumns: [characters.id, characters.campaignId],
    }).onDelete('restrict'),
    foreignKey({
      columns: [t.itemId, t.campaignId],
      foreignColumns: [gameItems.id, gameItems.campaignId],
    }).onDelete('restrict'),
    check('inventory_quantity_bounds', sql`${t.quantity} BETWEEN 0 AND 10000`),
    check(
      'equipped_requires_quantity',
      sql`NOT ${t.equipped} OR ${t.quantity} > 0`,
    ),
  ],
);
export const relationshipMetrics = pgTable(
  'relationship_metrics',
  {
    campaignId: campaignId(),
    name: text('name').notNull(),
    minimum: integer('minimum').notNull(),
    maximum: integer('maximum').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.campaignId, t.name] }),
    check('metric_range', sql`${t.minimum} < ${t.maximum}`),
  ],
);
export const relationships = pgTable(
  'character_relationships',
  {
    campaignId: campaignId(),
    fromCharacterId: uuid('from_character_id').notNull(),
    toCharacterId: uuid('to_character_id').notNull(),
    metric: text('metric').notNull(),
    value: integer('value').notNull(),
    reason: text('reason').notNull(),
    visibility: diceVisibility('visibility').notNull(),
  },
  (t) => [
    primaryKey({
      columns: [t.campaignId, t.fromCharacterId, t.toCharacterId, t.metric],
    }),
    foreignKey({
      columns: [t.fromCharacterId, t.campaignId],
      foreignColumns: [characters.id, characters.campaignId],
    }).onDelete('restrict'),
    foreignKey({
      columns: [t.toCharacterId, t.campaignId],
      foreignColumns: [characters.id, characters.campaignId],
    }).onDelete('restrict'),
    foreignKey({
      columns: [t.campaignId, t.metric],
      foreignColumns: [
        relationshipMetrics.campaignId,
        relationshipMetrics.name,
      ],
    }).onDelete('restrict'),
    check(
      'relationship_not_self',
      sql`${t.fromCharacterId} <> ${t.toCharacterId}`,
    ),
    check('relationship_reason_nonempty', sql`length(btrim(${t.reason})) > 0`),
  ],
);
export const worldEntities = pgTable(
  'world_entities',
  {
    id: id(),
    campaignId: campaignId(),
    kind: text('kind', { enum: ['LOCATION', 'OBJECT', 'FACTION'] }).notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    status: text('status').notNull(),
    accessible: boolean('accessible').notNull(),
    privateNotes: text('private_notes').notNull().default(''),
    visibility: diceVisibility('visibility').notNull(),
  },
  (t) => [
    check(
      'world_kind_valid',
      sql`${t.kind} IN ('LOCATION','OBJECT','FACTION')`,
    ),
    index('world_campaign_idx').on(t.campaignId),
  ],
);
export const gameCommands = pgTable(
  'game_commands',
  {
    id: id(),
    campaignId: campaignId(),
    commandId: uuid('command_id').notNull(),
    digest: text('digest').notNull(),
    // JSONB stores a versioned command receipt, never the canonical character/world state.
    result: jsonb('result').$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique('command_campaign_key').on(t.campaignId, t.commandId)],
);
export const gameEvents = pgTable(
  'game_events',
  {
    id: id(),
    sequence: serial('sequence').notNull().unique(),
    publicSequence: integer('public_sequence'),
    campaignId: campaignId(),
    sessionId: uuid('session_id'),
    commandId: uuid('command_id').notNull(),
    type: text('type').notNull(),
    description: text('description').notNull(),
    visibility: diceVisibility('visibility').notNull(),
    // Immutable audit diff only; current state is relational.
    changes: jsonb('changes').$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('event_id_campaign').on(t.id, t.campaignId),
    unique('events_public_sequence').on(t.campaignId, t.publicSequence),
    check(
      'events_public_sequence_visibility',
      sql`(${t.visibility} = 'GM_ONLY' AND ${t.publicSequence} IS NULL) OR (${t.visibility} <> 'GM_ONLY' AND ${t.publicSequence} > 0 AND ${t.publicSequence} IS NOT NULL)`,
    ),
    foreignKey({
      columns: [t.sessionId, t.campaignId],
      foreignColumns: [campaignSessions.id, campaignSessions.campaignId],
    }).onDelete('restrict'),
    index('events_campaign_sequence_idx').on(t.campaignId, t.sequence),
    index('events_session_sequence_idx').on(t.sessionId, t.sequence),
  ],
);
export const eventParticipants = pgTable(
  'game_event_participants',
  {
    campaignId: campaignId(),
    eventId: uuid('event_id').notNull(),
    characterId: uuid('character_id').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.characterId] }),
    foreignKey({
      columns: [t.eventId, t.campaignId],
      foreignColumns: [gameEvents.id, gameEvents.campaignId],
    }).onDelete('restrict'),
    foreignKey({
      columns: [t.characterId, t.campaignId],
      foreignColumns: [characters.id, characters.campaignId],
    }).onDelete('restrict'),
  ],
);
export const checkRequests = pgTable(
  'blue_rose_check_requests',
  {
    id: id(),
    campaignId: campaignId(),
    sessionId: uuid('session_id').notNull(),
    characterId: uuid('character_id').notNull(),
    ability: blueRoseAbility('ability').notNull(),
    focusId: text('focus_id').references(() => ruleReferences.id, {
      onDelete: 'restrict',
    }),
    targetNumber: integer('target_number').notNull(),
    modifier: integer('modifier').notNull().default(0),
    reason: text('reason').notNull(),
    stuntsEligible: boolean('stunts_eligible').notNull().default(false),
    visibility: diceVisibility('visibility').notNull(),
    resolved: boolean('resolved').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    unique('check_id_campaign').on(t.id, t.campaignId),
    foreignKey({
      columns: [t.sessionId, t.campaignId],
      foreignColumns: [campaignSessions.id, campaignSessions.campaignId],
    }).onDelete('restrict'),
    foreignKey({
      columns: [t.characterId, t.campaignId],
      foreignColumns: [characters.id, characters.campaignId],
    }).onDelete('restrict'),
    check('check_tn_positive', sql`${t.targetNumber} BETWEEN 1 AND 100`),
    check('check_modifier_bounds', sql`${t.modifier} BETWEEN -30 AND 30`),
    index('check_requests_campaign_idx').on(t.campaignId, t.resolved),
  ],
);
export const diceRolls = pgTable(
  'blue_rose_dice_rolls',
  {
    id: id(),
    sequence: serial('sequence').notNull().unique(),
    publicSequence: integer('public_sequence'),
    campaignId: campaignId(),
    sessionId: uuid('session_id').notNull(),
    characterId: uuid('character_id'),
    requestId: uuid('request_id').unique(),
    die1: integer('die1').notNull(),
    die2: integer('die2').notNull(),
    dramaDie: integer('drama_die').notNull(),
    modifier: integer('modifier').notNull(),
    total: integer('total').notNull(),
    success: boolean('success'),
    stuntPoints: integer('stunt_points').notNull(),
    reason: text('reason').notNull(),
    visibility: diceVisibility('visibility').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('rolls_public_sequence').on(t.campaignId, t.publicSequence),
    check(
      'rolls_public_sequence_visibility',
      sql`(${t.visibility} = 'GM_ONLY' AND ${t.publicSequence} IS NULL) OR (${t.visibility} <> 'GM_ONLY' AND ${t.publicSequence} > 0 AND ${t.publicSequence} IS NOT NULL)`,
    ),
    foreignKey({
      columns: [t.sessionId, t.campaignId],
      foreignColumns: [campaignSessions.id, campaignSessions.campaignId],
    }).onDelete('restrict'),
    foreignKey({
      columns: [t.characterId, t.campaignId],
      foreignColumns: [characters.id, characters.campaignId],
    }).onDelete('restrict'),
    foreignKey({
      columns: [t.requestId, t.campaignId],
      foreignColumns: [checkRequests.id, checkRequests.campaignId],
    }).onDelete('restrict'),
    check(
      'roll_faces_valid',
      sql`${t.die1} BETWEEN 1 AND 6 AND ${t.die2} BETWEEN 1 AND 6 AND ${t.dramaDie} BETWEEN 1 AND 6`,
    ),
    check(
      'roll_total_valid',
      sql`${t.total} = ${t.die1} + ${t.die2} + ${t.dramaDie} + ${t.modifier}`,
    ),
    check(
      'roll_sp_valid',
      sql`${t.stuntPoints} BETWEEN 0 AND 6 AND (${t.stuntPoints} = 0 OR (${t.success} AND ${t.stuntPoints} = ${t.dramaDie} AND (${t.die1} = ${t.die2} OR ${t.die1} = ${t.dramaDie} OR ${t.die2} = ${t.dramaDie})))`,
    ),
    index('rolls_campaign_sequence_idx').on(t.campaignId, t.sequence),
  ],
);

export const characterVitals = pgTable(
  'character_vitals',
  {
    characterId: uuid('character_id')
      .primaryKey()
      .references(() => characters.id, { onDelete: 'restrict' }),
    fatigueLevel: integer('fatigue_level').notNull().default(0),
    castsSinceRest: integer('casts_since_rest').notNull().default(0),
    living: boolean('living').notNull().default(true),
    unconsciousHours: integer('unconscious_hours'),
    cureUsed: boolean('cure_used').notNull().default(false),
    breatherAvailable: boolean('breather_available').notNull().default(false),
    lifeState: text('life_state', {
      enum: ['ALIVE', 'DYING', 'DEAD', 'UNCONSCIOUS'],
    })
      .notNull()
      .default('ALIVE'),
  },
  (t) => [
    check('vitals_fatigue_range', sql`${t.fatigueLevel} BETWEEN 0 AND 4`),
    check('vitals_casts_nonnegative', sql`${t.castsSinceRest} >= 0`),
    check(
      'vitals_state_valid',
      sql`${t.lifeState} IN ('ALIVE','DYING','DEAD','UNCONSCIOUS')`,
    ),
  ],
);
export const combatProfiles = pgTable(
  'blue_rose_combat_profiles',
  {
    characterId: uuid('character_id')
      .primaryKey()
      .references(() => characters.id, { onDelete: 'restrict' }),
    armorType: text('armor_type', {
      enum: ['NONE', 'LIGHT', 'MEDIUM', 'HEAVY'],
    }).notNull(),
    armorTrained: boolean('armor_trained').notNull(),
    shieldType: text('shield_type', {
      enum: ['NONE', 'LIGHT', 'MEDIUM', 'HEAVY'],
    }).notNull(),
    shieldTrained: boolean('shield_trained').notNull(),
    baseSpeed: integer('base_speed').notNull(),
  },
  (t) => [
    check(
      'combat_profile_armor',
      sql`${t.armorType} IN ('NONE','LIGHT','MEDIUM','HEAVY') AND ${t.shieldType} IN ('NONE','LIGHT','MEDIUM','HEAVY')`,
    ),
    check('combat_profile_speed', sql`${t.baseSpeed} BETWEEN 0 AND 100`),
  ],
);
export const weaponTraining = pgTable(
  'blue_rose_weapon_training',
  {
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'restrict' }),
    ruleId: weaponRule('rule_id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.characterId, t.ruleId] })],
);
export const combatEncounters = pgTable(
  'blue_rose_encounters',
  {
    id: id(),
    campaignId: campaignId(),
    sessionId: uuid('session_id').notNull(),
    status: text('status', { enum: ['ACTIVE', 'COMPLETED'] })
      .notNull()
      .default('ACTIVE'),
    round: integer('round').notNull().default(1),
    turnIndex: integer('turn_index').notNull().default(0),
    visibility: diceVisibility('visibility').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('encounter_id_campaign').on(t.id, t.campaignId),
    uniqueIndex('one_active_encounter')
      .on(t.campaignId)
      .where(sql`${t.status} = 'ACTIVE'`),
    foreignKey({
      columns: [t.sessionId, t.campaignId],
      foreignColumns: [campaignSessions.id, campaignSessions.campaignId],
    }).onDelete('restrict'),
    check(
      'encounter_state_valid',
      sql`${t.status} IN ('ACTIVE','COMPLETED') AND ${t.round} > 0 AND ${t.turnIndex} >= 0`,
    ),
  ],
);
export const combatMembers = pgTable(
  'blue_rose_combat_members',
  {
    campaignId: campaignId(),
    encounterId: uuid('encounter_id').notNull(),
    characterId: uuid('character_id').notNull(),
    ordinal: integer('ordinal').notNull(),
    initiative: integer('initiative').notNull(),
    initiativeDrama: integer('initiative_drama').notNull(),
    weaponItemId: uuid('weapon_item_id').notNull(),
    x: integer('x').notNull(),
    y: integer('y').notNull(),
    majorUsed: boolean('major_used').notNull().default(false),
    minorUsed: integer('minor_used').notNull().default(0),
    aimed: boolean('aimed').notNull().default(false),
    defenseBonus: integer('defense_bonus').notNull().default(0),
    prone: boolean('prone').notNull().default(false),
    loaded: boolean('loaded').notNull().default(true),
    dyingAtRound: integer('dying_at_round'),
    usesDyingRules: boolean('uses_dying_rules').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.encounterId, t.characterId] }),
    unique('member_order_unique').on(t.encounterId, t.ordinal),
    foreignKey({
      columns: [t.encounterId, t.campaignId],
      foreignColumns: [combatEncounters.id, combatEncounters.campaignId],
    }).onDelete('restrict'),
    foreignKey({
      columns: [t.characterId, t.campaignId],
      foreignColumns: [characters.id, characters.campaignId],
    }).onDelete('restrict'),
    foreignKey({
      columns: [t.weaponItemId, t.campaignId],
      foreignColumns: [gameItems.id, gameItems.campaignId],
    }).onDelete('restrict'),
    check(
      'combat_member_actions',
      sql`${t.minorUsed} BETWEEN 0 AND 2 AND (NOT ${t.majorUsed} OR ${t.minorUsed} <= 1)`,
    ),
  ],
);
export const combatAttacks = pgTable(
  'blue_rose_attacks',
  {
    id: id(),
    encounterId: uuid('encounter_id')
      .notNull()
      .references(() => combatEncounters.id, { onDelete: 'restrict' }),
    actorId: uuid('actor_id').notNull(),
    targetId: uuid('target_id').notNull(),
    rollId: uuid('roll_id')
      .notNull()
      .references(() => diceRolls.id, { onDelete: 'restrict' }),
    round: integer('round').notNull(),
    stuntPoints: integer('stunt_points').notNull(),
    resolved: boolean('resolved').notNull().default(false),
    rawDamage: integer('raw_damage'),
    armor: integer('armor'),
    damage: integer('damage'),
  },
  (t) => [
    foreignKey({
      columns: [t.encounterId, t.actorId],
      foreignColumns: [combatMembers.encounterId, combatMembers.characterId],
    }).onDelete('restrict'),
    foreignKey({
      columns: [t.encounterId, t.targetId],
      foreignColumns: [combatMembers.encounterId, combatMembers.characterId],
    }).onDelete('restrict'),
    unique('attack_roll_unique').on(t.rollId),
    index('attacks_encounter_pending').on(t.encounterId, t.resolved),
    check(
      'attack_damage_nonnegative',
      sql`${t.damage} IS NULL OR ${t.damage} >= 0`,
    ),
  ],
);
export const combatStuntUses = pgTable(
  'blue_rose_stunt_uses',
  {
    attackId: uuid('attack_id')
      .notNull()
      .references(() => combatAttacks.id, { onDelete: 'restrict' }),
    stuntId: text('stunt_id').notNull(),
    cost: integer('cost').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.attackId, t.stuntId] }),
    check('stunt_cost_positive', sql`${t.cost} > 0`),
  ],
);
export const arcanaRequests = pgTable(
  'blue_rose_arcana_requests',
  {
    id: id(),
    campaignId: campaignId(),
    sessionId: uuid('session_id').notNull(),
    characterId: uuid('character_id').notNull(),
    targetId: uuid('target_id').notNull(),
    visibility: diceVisibility('visibility').notNull(),
    resolved: boolean('resolved').notNull().default(false),
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
    foreignKey({
      columns: [t.targetId, t.campaignId],
      foreignColumns: [characters.id, characters.campaignId],
    }).onDelete('restrict'),
  ],
);
export const advancedTests = pgTable(
  'blue_rose_advanced_tests',
  {
    id: id(),
    campaignId: campaignId(),
    characterId: uuid('character_id').notNull(),
    ability: blueRoseAbility('ability').notNull(),
    focusId: text('focus_id').references(() => ruleReferences.id, {
      onDelete: 'restrict',
    }),
    targetNumber: integer('target_number').notNull(),
    threshold: integer('threshold').notNull(),
    progress: integer('progress').notNull().default(0),
    attempts: integer('attempts').notNull().default(0),
    intervalMinutes: integer('interval_minutes').notNull(),
    reason: text('reason').notNull(),
    visibility: diceVisibility('visibility').notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.characterId, t.campaignId],
      foreignColumns: [characters.id, characters.campaignId],
    }).onDelete('restrict'),
    unique('advanced_id_campaign').on(t.id, t.campaignId),
    check(
      'advanced_bounds',
      sql`${t.targetNumber} > 0 AND ${t.threshold} > 0 AND ${t.progress} >= 0 AND ${t.attempts} >= 0 AND ${t.intervalMinutes} > 0`,
    ),
  ],
);
export const specialCheckRequests = pgTable(
  'blue_rose_special_check_requests',
  {
    id: id(),
    campaignId: campaignId(),
    sessionId: uuid('session_id').notNull(),
    kind: text('kind', { enum: ['OPPOSED', 'ADVANCED'] }).notNull(),
    characterId: uuid('character_id').notNull(),
    ability: blueRoseAbility('ability').notNull(),
    focusId: text('focus_id'),
    modifier: integer('modifier').notNull().default(0),
    opponentId: uuid('opponent_id'),
    opponentAbility: blueRoseAbility('opponent_ability'),
    opponentFocusId: text('opponent_focus_id'),
    opponentModifier: integer('opponent_modifier').notNull().default(0),
    advancedTestId: uuid('advanced_test_id'),
    reason: text('reason').notNull(),
    visibility: diceVisibility('visibility').notNull(),
    stuntsEligible: boolean('stunts_eligible').notNull().default(false),
    resolved: boolean('resolved').notNull().default(false),
  },
  (t) => [
    foreignKey({
      columns: [t.characterId, t.campaignId],
      foreignColumns: [characters.id, characters.campaignId],
    }).onDelete('restrict'),
    foreignKey({
      columns: [t.opponentId, t.campaignId],
      foreignColumns: [characters.id, characters.campaignId],
    }).onDelete('restrict'),
    foreignKey({
      columns: [t.advancedTestId, t.campaignId],
      foreignColumns: [advancedTests.id, advancedTests.campaignId],
    }).onDelete('restrict'),
    foreignKey({
      columns: [t.sessionId, t.campaignId],
      foreignColumns: [campaignSessions.id, campaignSessions.campaignId],
    }).onDelete('restrict'),
    check(
      'special_kind_fields',
      sql`(${t.kind} = 'OPPOSED' AND ${t.opponentId} IS NOT NULL AND ${t.opponentAbility} IS NOT NULL AND ${t.advancedTestId} IS NULL) OR (${t.kind} = 'ADVANCED' AND ${t.advancedTestId} IS NOT NULL AND ${t.opponentId} IS NULL)`,
    ),
  ],
);

export const campaignMounts = pgTable(
  'campaign_mounts',
  {
    campaignId: campaignId(),
    characterId: uuid('character_id')
      .primaryKey()
      .references(() => characters.id),
    riderId: uuid('rider_id')
      .notNull()
      .references(() => characters.id),
    locationId: uuid('location_id')
      .notNull()
      .references(() => worldEntities.id),
    mounted: boolean('mounted').notNull(),
  },
  (t) => [unique().on(t.campaignId, t.riderId)],
);
