import { z } from 'zod';
import { dialogueActs } from './dialogue';

export const freeIntents = [
  'TALK',
  'QUERY',
  'INVESTIGATE',
  'OBSERVE',
  'EXPLORE',
  'MOVE',
  'ARCANA',
  'ATTACK',
  'DEFEND',
  'INTERACT',
  'USE_ITEM',
  'HELP',
  'REST',
  'WAIT',
  'SOCIAL',
  'REFUSE',
  'NEGOTIATE',
  'LIE',
  'OOC',
  'CORRECT',
  'THINK',
  'OTHER',
] as const;
// Names are selectors, never authority to create persistent IDs or world facts.
const namedTarget = z.strictObject({
  type: z.enum(['CHARACTER', 'WORLD', 'ITEM']),
  name: z.string().trim().min(1).max(200),
});
const expressionDescription =
  'Ato comunicativo da mensagem inteira, independente de intent, tool e interactionMode. ' +
  'QUESTION: pedido de informação, inclusive indireto e sem interrogação. ' +
  'DIRECT: declaração ou comando atual, inclusive comando de consulta. ' +
  'HYPOTHETICAL: possibilidade não executada; NEGATED: ação recusada; ' +
  'QUOTED: conteúdo atribuído; COMPOUND: tentativas distintas. ' +
  'O canal ACT e a descrição operacional não transformam pergunta em DIRECT.';
export const freeToolSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('DIALOGUE'),
    topic: z
      .string()
      .min(1)
      .max(100)
      .nullish()
      .transform((v) => v ?? undefined)
      .optional(),
    act: z
      .enum(dialogueActs)
      .nullish()
      .transform((v) => v ?? undefined)
      .optional(),
  }),
  z.strictObject({ type: z.literal('OBSERVE') }),
  z.strictObject({
    type: z.literal('QUERY'),
    subject: z.enum([
      'CHARACTER',
      'LOCATION',
      'INVENTORY',
      'RULES',
      'MEMORY',
      'OBJECTIVES',
    ]),
  }),
  z.strictObject({
    type: z.literal('CLARIFY'),
    question: z.string().trim().min(1).max(500),
  }),
  z.strictObject({ type: z.literal('ADJUDICATE') }),
  z.strictObject({
    type: z.literal('PREPARED_CHECK'),
    capability: z.string().trim().min(1).max(3000),
  }),
  z.strictObject({
    type: z.literal('ARCANA'),
    arcanum: z.enum([
      'psychic-shield',
      'second-sight',
      'psychic-contact',
      'cure',
      'body-control',
      'move-object',
      'wind-shaping',
    ]),
    raised: z
      .boolean()
      .nullish()
      .transform((v) => v ?? undefined)
      .optional()
      .describe(
        'Somente psychic-shield: erguer=true ou baixar=false, se declarado. Nos demais arcanos omitir ou null.',
      ),
    tradition: z
      .enum(['PSYCHIC', 'ANIMISM', 'HEALING', 'MEDITATIVE'])
      .nullish()
      .transform((v) => v ?? undefined)
      .optional()
      .describe(
        'Somente psychic-contact ou body-control, se declarada. Não deduzir tradição pelo nome do arcano ou pela ficha. Nos demais omitir ou null.',
      ),
    use: z
      .enum([
        'SLEEP',
        'DIFFICULT_SLEEP',
        'HALF_BREATHING',
        'QUARTER_BREATHING',
        'IGNORE_PAIN',
        'BODY_AWARENESS',
        'FEIGN_DEATH',
      ])
      .nullish()
      .transform((v) => v ?? undefined)
      .optional()
      .describe(
        'Somente body-control: uso expressamente escolhido. Nos demais arcanos omitir ou null.',
      ),
    fatigue: z
      .boolean()
      .nullish()
      .transform((v) => v ?? undefined)
      .optional()
      .describe(
        'Somente move-object: opção voluntária expressamente escolhida. Não é fadiga calculada pelo motor. Nos demais omitir ou null.',
      ),
    category: z
      .number()
      .int()
      .min(0)
      .max(3)
      .nullish()
      .transform((v) => v ?? undefined)
      .optional()
      .describe(
        'Somente wind-shaping: categoria desejada expressamente escolhida. Não é a categoria atual do contexto. Nos demais omitir ou null.',
      ),
  }),
  z.strictObject({
    type: z.literal('COMBAT'),
    action: z.enum(['ATTACK', 'DEFEND']),
  }),
  z.strictObject({
    type: z.literal('REST'),
    kind: z.enum(['BREATHER', 'LIGHT_REST', 'SLEEP']),
    sustenanceConfirmed: z
      .literal(true)
      .nullish()
      .transform((v) => v ?? undefined)
      .optional(),
  }),
  z.strictObject({
    type: z.literal('WAIT'),
    minutes: z.number().int().min(1).max(60),
  }),
]);
export const freeActionSchema = z.strictObject({
  kind: z.literal('FREE'),
  intent: z.enum(freeIntents),
  description: z.string().trim().min(1).max(1000),
  target: namedTarget.nullable(),
  // Optional for stored/legacy FREE proposals. Selection policy v1 requires an
  // expression on newly interpreted turns; it never authorizes a capability.
  expression: z
    .enum([
      'DIRECT',
      'QUESTION',
      'HYPOTHETICAL',
      'NEGATED',
      'QUOTED',
      'COMPOUND',
    ])
    .nullable()
    .optional()
    .describe(expressionDescription),
  evidence: z.array(z.string().min(1).max(80)).max(8).nullable().optional(),
  tool: freeToolSchema,
});
export type FreeAction = z.infer<typeof freeActionSchema>;
export const narrativeBeatSchema = z.strictObject({
  kind: z.enum(['RESULT', 'ATMOSPHERE', 'DIALOGUE', 'QUESTION', 'OOC']),
  speakerId: z.uuid().nullable(),
  text: z.string().trim().min(1).max(3000),
  factIds: z.array(z.uuid()).max(100),
});
export type NarrativeBeat = z.infer<typeof narrativeBeatSchema>;
