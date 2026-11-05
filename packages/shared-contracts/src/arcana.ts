import { z } from 'zod';
const actor = { characterId: z.uuid() };
export const arcanaUseSchema = z.discriminatedUnion('arcanum', [
  z.strictObject({
    ...actor,
    arcanum: z.literal('psychic-shield'),
    raised: z.boolean(),
  }),
  z.strictObject({
    ...actor,
    arcanum: z.literal('second-sight'),
    contextId: z
      .uuid()
      .nullish()
      .transform((v) => v ?? undefined)
      .optional(),
  }),
  z.strictObject({
    ...actor,
    arcanum: z.literal('psychic-contact'),
    targetId: z.uuid(),
    tradition: z.enum(['PSYCHIC', 'ANIMISM']),
  }),
  z.strictObject({
    ...actor,
    arcanum: z.literal('body-control'),
    tradition: z.enum(['HEALING', 'MEDITATIVE', 'ANIMISM']),
    targetId: z.uuid(),
    use: z.enum([
      'SLEEP',
      'DIFFICULT_SLEEP',
      'HALF_BREATHING',
      'QUARTER_BREATHING',
      'IGNORE_PAIN',
      'BODY_AWARENESS',
      'FEIGN_DEATH',
    ]),
  }),
  z.strictObject({
    ...actor,
    arcanum: z.literal('move-object'),
    contextId: z.uuid(),
    fatigue: z.boolean(),
  }),
  z.strictObject({
    ...actor,
    arcanum: z.literal('wind-shaping'),
    contextId: z.uuid(),
    category: z.number().int().min(0).max(3),
  }),
]);
export type ArcanaUse = z.infer<typeof arcanaUseSchema>;
// Authored world facts: never accepted from a model or the player action endpoint.
export const arcaneContextSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('CREATURE'),
    targetId: z.uuid(),
    nature: z.enum(['PERSON', 'ANIMAL']),
    touching: z.boolean(),
    willing: z.boolean(),
    lineOfSight: z.literal(true),
  }),
  z.strictObject({
    kind: z.literal('OBJECT'),
    massKg: z.number().positive().max(1000),
    unattended: z.literal(true),
    lineOfSight: z.literal(true),
  }),
  z.strictObject({
    kind: z.literal('WIND'),
    category: z.number().int().min(0).max(3),
    radiusMeters: z.number().positive().max(1200),
    lineOfSight: z.literal(true),
  }),
  z.strictObject({
    kind: z.literal('TRACE'),
    distanceMeters: z.number().min(0).max(10000),
    shieldTotal: z.number().int().min(0).max(100),
    discipline: z.string().min(1).max(200),
    arcanum: z.string().min(1).max(200),
    casterId: z.uuid().nullable(),
  }),
]);
export type ArcaneContext = z.infer<typeof arcaneContextSchema>;
