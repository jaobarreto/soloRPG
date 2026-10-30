import { z } from 'zod';
export const abilities = [
  'ACCURACY',
  'COMMUNICATION',
  'CONSTITUTION',
  'DEXTERITY',
  'FIGHTING',
  'INTELLIGENCE',
  'PERCEPTION',
  'STRENGTH',
  'WILLPOWER',
] as const;
export const abilitySchema = z.enum(abilities);
export enum DiceVisibility {
  PUBLIC = 'PUBLIC',
  PLAYER_ONLY = 'PLAYER_ONLY',
  GM_ONLY = 'GM_ONLY',
}
export const visibilitySchema = z.enum(DiceVisibility);
export const characterKinds = [
  'PROTAGONIST',
  'NPC',
  'COMPANION',
  'ADVERSARY',
] as const;
const short = z.string().trim().min(1).max(200);
const text = z.string().trim().max(10000);
export const abilityScoresSchema = z.strictObject(
  Object.fromEntries(
    abilities.map((key) => [key, z.number().int().min(-10).max(30)]),
  ) as Record<(typeof abilities)[number], z.ZodNumber>,
);
export const featureSchema = z.strictObject({
  ruleId: short,
  degree: z.enum(['NOVICE', 'JOURNEYMAN', 'MASTER']).optional(),
  improved: z.boolean().default(false),
});
// Technical bounds are storage protections, not Blue Rose character-generation rules.
export const createCharacterSchema = z.strictObject({
  commandId: z.uuid(),
  name: short,
  description: text.default(''),
  people: short,
  characterClass: z.enum(['ADEPT', 'EXPERT', 'WARRIOR']),
  background: short,
  level: z.number().int().min(1).max(20),
  abilities: abilityScoresSchema,
  maxHealth: z.number().int().min(1).max(10000),
  calling: text.default(''),
  destiny: text.default(''),
  fate: text.default(''),
  languages: z.array(short).max(30).default([]),
  goals: z.array(short).max(30).default([]),
  features: z.array(featureSchema).max(100).default([]),
});
export type CreateCharacter = z.infer<typeof createCharacterSchema>;
export const editCharacterSchema = z.strictObject({
  commandId: z.uuid(),
  name: short.optional(),
  description: text.optional(),
  goals: z.array(short).max(30).optional(),
});
export const rollInputSchema = z.strictObject({
  commandId: z.uuid(),
  sessionId: z.uuid(),
});
export const checkInputSchema = z.strictObject({
  commandId: z.uuid(),
  requestId: z.uuid(),
});
export const inventoryActionSchema = z.strictObject({
  commandId: z.uuid(),
  sessionId: z.uuid(),
  itemId: z.uuid(),
  action: z.enum(['EQUIP', 'UNEQUIP', 'CONSUME', 'TRANSFER']),
  quantity: z.number().int().min(1).max(10000).default(1),
  toCharacterId: z.uuid().optional(),
});
export const gamePageSchema = z.strictObject({
  after: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  sessionId: z.uuid().optional(),
});
export const publicCharacterSchema = z.strictObject({
  fatigueLevel: z.number().int().min(0).max(4),
  lifeState: z.enum(['ALIVE', 'DYING', 'DEAD', 'UNCONSCIOUS']),
  id: z.uuid(),
  campaignId: z.uuid(),
  name: z.string(),
  description: z.string(),
  kind: z.enum(characterKinds),
  people: z.string(),
  characterClass: z.enum(['ADEPT', 'EXPERT', 'WARRIOR']).nullable(),
  background: z.string(),
  level: z.number().int(),
  calling: z.string(),
  destiny: z.string(),
  fate: z.string(),
  personality: z.string(),
  motivations: z.string(),
  state: z.string(),
  abilities: abilityScoresSchema,
  resources: z.array(
    z.strictObject({
      name: z.string(),
      current: z.number().int(),
      maximum: z.number().int(),
    }),
  ),
  features: z.array(
    z.strictObject({
      ruleId: z.string(),
      name: z.string(),
      kind: z.string(),
      degree: z.string().nullable(),
      improved: z.boolean(),
      status: z.string(),
    }),
  ),
  languages: z.array(z.string()),
  goals: z.array(z.string()),
  conditions: z.array(
    z.strictObject({ id: z.uuid(), name: z.string(), description: z.string() }),
  ),
  inventory: z.array(
    z.strictObject({
      itemId: z.uuid(),
      name: z.string(),
      description: z.string(),
      quantity: z.number().int().positive(),
      equipped: z.boolean(),
      consumable: z.boolean(),
    }),
  ),
});
const face = z.number().int().min(1).max(6);
export const publicRollSchema = z.strictObject({
  id: z.uuid(),
  sessionId: z.uuid(),
  characterId: z.uuid().nullable(),
  dice: z.tuple([face, face, face]),
  dramaDie: face,
  modifier: z.number().int(),
  total: z.number().int(),
  success: z.boolean().nullable(),
  stuntPoints: z.number().int().min(0).max(6),
  availableStuntPoints: z.number().int().min(0).max(6),
  reason: z.string(),
  visibility: z.enum(['PUBLIC', 'PLAYER_ONLY']),
  createdAt: z.iso.datetime(),
});
export const publicCheckRequestSchema = z.strictObject({
  id: z.uuid(),
  characterId: z.uuid(),
  ability: abilitySchema,
  focusId: z.string().nullable(),
  reason: z.string(),
});
export const publicWorldEntitySchema = z.strictObject({
  id: z.uuid(),
  kind: z.string(),
  name: z.string(),
  description: z.string(),
  status: z.string(),
  accessible: z.boolean(),
});
export const publicRelationshipSchema = z.strictObject({
  fromCharacterId: z.uuid(),
  toCharacterId: z.uuid(),
  metric: z.string(),
  value: z.number().int(),
  minimum: z.number().int(),
  maximum: z.number().int(),
  reason: z.string(),
});
export const publicGameEventSchema = z.strictObject({
  id: z.uuid(),
  sequence: z.number().int().positive(),
  sessionId: z.uuid().nullable(),
  type: z.string(),
  description: z.string(),
  participants: z.array(z.uuid()),
  changes: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime(),
});
export function gamePageResponseSchema<T extends z.ZodType>(item: T) {
  return z.strictObject({
    data: z.array(item),
    nextCursor: z.number().int().nullable(),
    hasMore: z.boolean(),
  });
}
export type PublicCharacter = z.infer<typeof publicCharacterSchema>;
export type PublicRoll = z.infer<typeof publicRollSchema>;
export type PublicCheckRequest = z.infer<typeof publicCheckRequestSchema>;
export type PublicWorldEntity = z.infer<typeof publicWorldEntitySchema>;
export type PublicRelationship = z.infer<typeof publicRelationshipSchema>;
export type PublicGameEvent = z.infer<typeof publicGameEventSchema>;
export interface GamePage<T> {
  data: T[];
  nextCursor: number | null;
  hasMore: boolean;
}

export const weaponRuleIds = ['heavy-blade', 'light-blade', 'longbow'] as const;
export const combatStuntIds = [
  'MIGHTY_BLOW',
  'PIERCE_ARMOR',
  'KNOCK_PRONE',
  'DEFENSIVE_STANCE',
  'LETHAL_BLOW',
] as const;
export const combatActionSchema = z.strictObject({
  commandId: z.uuid(),
  sessionId: z.uuid(),
  encounterId: z.uuid(),
  characterId: z.uuid(),
  action: z.enum([
    'ATTACK',
    'AIM',
    'DEFEND',
    'MOVE',
    'STAND',
    'RELOAD',
    'END_TURN',
  ]),
  targetId: z.uuid().optional(),
  x: z.number().int().min(-10000).max(10000).optional(),
  y: z.number().int().min(-10000).max(10000).optional(),
});
export const combatResolveSchema = z.strictObject({
  commandId: z.uuid(),
  sessionId: z.uuid(),
  attackId: z.uuid(),
  stunts: z.array(z.enum(combatStuntIds)).max(5).default([]),
});
export const arcanaResolveSchema = z.strictObject({
  commandId: z.uuid(),
  requestId: z.uuid(),
});
export const publicCombatSchema = z.strictObject({
  id: z.uuid(),
  sessionId: z.uuid(),
  status: z.enum(['ACTIVE', 'COMPLETED']),
  round: z.number().int().positive(),
  turnCharacterId: z.uuid(),
  members: z.array(
    z.strictObject({
      characterId: z.uuid(),
      name: z.string(),
      initiative: z.number().int(),
      x: z.number().int(),
      y: z.number().int(),
      prone: z.boolean(),
      majorUsed: z.boolean(),
      minorUsed: z.number().int().min(0).max(2),
      health: z.number().int().min(0),
      lifeState: z.string(),
    }),
  ),
  pendingAttacks: z.array(
    z.strictObject({
      id: z.uuid(),
      actorId: z.uuid(),
      targetId: z.uuid(),
      stuntPoints: z.number().int().min(0).max(6),
    }),
  ),
});
export type PublicCombat = z.infer<typeof publicCombatSchema>;
export const publicArcanaRequestSchema = z.strictObject({
  id: z.uuid(),
  characterId: z.uuid(),
  targetId: z.uuid(),
});
export const publicAdvancedTestSchema = z.strictObject({
  id: z.uuid(),
  characterId: z.uuid(),
  reason: z.string(),
  progress: z.number().int().min(0),
  threshold: z.number().int().positive(),
  attempts: z.number().int().min(0),
  intervalMinutes: z.number().int().positive(),
});
