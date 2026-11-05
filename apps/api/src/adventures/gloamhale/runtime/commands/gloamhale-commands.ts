import { z } from 'zod';

const base = {
  campaignId: z.uuid(),
  commandId: z.uuid(),
  sessionId: z.uuid(),
  reason: z.string().trim().min(10).max(3000),
};
export const gloamhaleCommandSchema = z.discriminatedUnion('operation', [
  z.strictObject({
    ...base,
    operation: z.literal('GLOAMHALE_ENTER'),
    children: z
      .array(
        z.strictObject({
          characterId: z.uuid(),
          age: z.int().min(7).max(15),
          fear: z.string().trim().min(10).max(1000),
        }),
      )
      .min(4)
      .max(6),
    playerApprovedMemories: z.literal(true),
  }),
  z.strictObject({
    ...base,
    operation: z.literal('GLOAMHALE_TIME'),
    minutes: z.int().min(1).max(1440),
  }),
  z.strictObject({
    ...base,
    operation: z.literal('GLOAMHALE_MOVE'),
    characterId: z.uuid(),
    location: z.enum(['MANOR', 'GROUNDS', 'GROTTO']),
  }),
  z.strictObject({
    ...base,
    operation: z.literal('GLOAMHALE_RETURN'),
    characterIds: z.array(z.uuid()).min(1).max(6),
    cause: z.enum(['LEFT_LAKEBED', 'MANOR_DESTROYED', 'MUD_MOTHER']),
  }),
  // This amount is final damage adjudicated locally, including any protection.
  z.strictObject({
    ...base,
    operation: z.literal('GLOAMHALE_DAMAGE'),
    characterId: z.uuid(),
    damage: z.int().min(1).max(10000),
  }),
  z.strictObject({
    ...base,
    operation: z.literal('GLOAMHALE_RITUAL_BEGIN'),
    eggEaters: z.array(z.uuid()).max(6),
    dispelledHaints: z.boolean(),
    hazardProtection: z.enum(['NONE', 'ARMOR']),
  }),
  z.strictObject({
    ...base,
    operation: z.literal('GLOAMHALE_RITUAL_ROLL'),
    characterId: z.uuid(),
    task: z.enum(['CANDLES', 'POEM', 'SHAPING']),
    benefit: z.enum(['NONE', 'EGG', 'HAINT_TARGET', 'HAINT_DAMAGE']),
    // Explicit local adjustments for talents, Bonds, conditions, etc., before dice.
    modifier: z.int().min(-10).max(10),
  }),
  z.strictObject({
    ...base,
    operation: z.literal('GLOAMHALE_RITUAL_RESOLVE'),
    declineStunts: z.literal(true),
  }),
  z.strictObject({ ...base, operation: z.literal('GLOAMHALE_RITUAL_STOP') }),
]);
export type GloamhaleCommand = z.infer<typeof gloamhaleCommandSchema>;
