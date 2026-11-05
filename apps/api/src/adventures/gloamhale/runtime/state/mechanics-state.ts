import { ConflictException } from '@nestjs/common';
import { z } from 'zod';
import type { GloamhaleMechanics } from '../mechanics/gloamhale-mechanics';

const face = z.number().int().min(1).max(6);
const stateSchema = z.strictObject({
  children: z.record(
    z.uuid(),
    z.strictObject({
      original: z.record(z.string(), z.number().int()),
      age: z.number().int().min(7).max(15),
      fear: z.string().min(1),
      location: z.enum(['MANOR', 'GROUNDS', 'GROTTO']),
    }),
  ),
  stage: z.number().int().min(0).max(4),
  elapsedMinutes: z.number().int().nonnegative(),
  nextChangeAt: z.number().int().positive().nullable(),
  ritual: z
    .strictObject({
      status: z.enum(['ACTIVE', 'STOPPED', 'COMPLETED']),
      partyIds: z.array(z.uuid()),
      threshold: z.number().int().positive(),
      points: z.number().int().nonnegative(),
      tasks: z.array(z.enum(['CANDLES', 'POEM', 'SHAPING'])),
      eggEaters: z.array(z.uuid()),
      eggsUsed: z.array(z.uuid()),
      dispelledHaints: z.boolean(),
      haintsUsed: z.array(z.uuid()),
      hazardProtection: z.enum(['NONE', 'ARMOR']),
      pending: z
        .strictObject({
          characterId: z.uuid(),
          task: z.enum(['CANDLES', 'POEM', 'SHAPING']),
          benefit: z.enum(['NONE', 'EGG', 'HAINT_TARGET', 'HAINT_DAMAGE']),
          roll: z.strictObject({
            dice: z.tuple([face, face, face]),
            dramaDie: face,
            modifier: z.number().int(),
            total: z.number().int(),
          }),
          success: z.boolean(),
          stuntPoints: z.number().int().min(0).max(6),
          rollId: z.uuid(),
        })
        .nullable(),
    })
    .optional(),
});
// Legacy state shape is preserved and validated only by its owning module.
export function gloamhaleState(
  state: Record<string, unknown> | null,
): GloamhaleMechanics | null {
  if (!state) return null;
  const parsed = stateSchema.safeParse(state);
  if (!parsed.success)
    throw new ConflictException(
      'Invalid Gloamhale state; local review required',
    );
  return parsed.data;
}
