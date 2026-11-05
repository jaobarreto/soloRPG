import { z } from 'zod';
export const adventureActionSchema = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('RITUAL_ATTEMPT'),
    characterId: z.uuid(),
    task: z.enum(['CANDLES', 'POEM', 'SHAPING']),
    benefit: z.enum(['NONE', 'EGG', 'HAINT_TARGET', 'HAINT_DAMAGE']),
    declineStunts: z.literal(true),
  }),
  z.strictObject({ action: z.literal('RITUAL_STOP'), characterId: z.uuid() }),
]);
export type AdventureAction = z.infer<typeof adventureActionSchema>;
