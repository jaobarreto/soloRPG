import { z } from 'zod';
import { abilitySchema } from './game';

export const narrativeModes = [
  'SPEAK',
  'ACT',
  'THINK',
  'OUT_OF_CHARACTER',
] as const;
export const narrativeInputSchema = z.strictObject({
  actionId: z.uuid(),
  optionId: z.uuid().optional(),
  interactionMode: z.enum(narrativeModes),
  content: z.string().trim().min(1).max(10000),
});
// The model selects a server-prepared capability; it never supplies its effects.
export const narrativeProposalSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('OBSERVE') }),
  z.strictObject({ kind: z.literal('SCENE'), optionId: z.uuid() }),
  z.strictObject({
    kind: z.literal('ATTACK'),
    actorId: z.uuid(),
    targetId: z.uuid(),
  }),
]);
export const narrationSchema = z.strictObject({
  narrative: z.string().trim().min(1).max(12000),
  eventIds: z.array(z.uuid()).max(100),
});
export const usageSchema = z.strictObject({
  provider: z.enum(['gemini', 'groq']),
  model: z.string().max(200),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
  error: z.string().max(60).nullable(),
});
export const turnResponseSchema = z.strictObject({
  proposal: narrativeProposalSchema.nullable(),
  narration: narrationSchema.nullable(),
  usage: z.array(usageSchema).max(4),
  error: z.string().max(60).nullable(),
});
export const actionStatuses = [
  'PENDING',
  'AWAITING_ROLL',
  'AWAITING_STUNTS',
  'COMMITTED',
  'COMPLETED',
  'REJECTED',
] as const;
export const publicActionSchema = z.strictObject({
  id: z.uuid(),
  status: z.enum(actionStatuses),
  playerMessageId: z.uuid(),
  masterMessageId: z.uuid().nullable(),
  pendingRoll: z
    .strictObject({ requestId: z.uuid(), ability: abilitySchema })
    .nullable(),
  error: z.string().nullable(),
  retryable: z.boolean(),
});
export type PublicNarrativeAction = z.infer<typeof publicActionSchema>;
export type NarrativeProposal = z.infer<typeof narrativeProposalSchema>;
export type Narration = z.infer<typeof narrationSchema>;

// Local preparation only. These schemas are NEVER accepted from LLMs or player routes.
const line = z.string().trim().min(1).max(3000);
export const sceneEffectSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('TRANSFER'),
    fromId: z.uuid(),
    toId: z.uuid(),
    itemId: z.uuid(),
    quantity: z.number().int().min(1).max(100),
  }),
  z.strictObject({
    type: z.literal('RELATIONSHIP'),
    fromId: z.uuid(),
    toId: z.uuid(),
    metric: z.string().min(1).max(200),
    delta: z.number().int().min(-10).max(10),
  }),
  z.strictObject({
    type: z.literal('WORLD_STATUS'),
    entityId: z.uuid(),
    expectedStatus: line,
    status: line,
    accessible: z.boolean(),
  }),
]);
export const scenePlanSchema = z.strictObject({
  style: line.default(
    'Fantasia romântica, português brasileiro, ritmo moderado.',
  ),
  opening: line,
  presentCharacterIds: z.array(z.uuid()).max(30),
  options: z
    .array(
      z.strictObject({
        id: z.uuid(),
        intent: line,
        mode: z.enum(['SPEAK', 'ACT']),
        // Matching is an explicit, prepared prerequisite, not an LLM authorization.
        keywords: z.array(z.string().trim().min(2).max(100)).min(1).max(10),
        requiresOptionIds: z.array(z.uuid()).max(20).default([]),
        check: z
          .strictObject({
            ability: abilitySchema,
            focusId: z.string().max(200).nullable(),
            targetNumber: z.number().int().min(1).max(100),
            secret: z.boolean(),
          })
          .nullable(),
        successText: line,
        failureText: line,
        effects: z.array(sceneEffectSchema).max(10).default([]),
        witnesses: z.array(z.uuid()).max(30).default([]),
      }),
    )
    .max(50),
  objectives: z
    .array(
      z.strictObject({
        id: z.uuid(),
        description: line,
        requiredOptionIds: z.array(z.uuid()).min(1).max(20),
        weight: z.number().int().min(1).max(100).default(1),
      }),
    )
    .max(20)
    .default([]),
});
export type ScenePlan = z.infer<typeof scenePlanSchema>;
