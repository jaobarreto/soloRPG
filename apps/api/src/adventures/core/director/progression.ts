import { z } from 'zod';

const key = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/)
  .max(100);
export type Condition =
  | { type: 'FACT'; reference: string }
  | { type: 'OPTION'; sceneKey: string; optionKey: string; success?: boolean }
  | {
      type: 'EVENT';
      eventType: string;
      equals?: Record<string, string | number | boolean>;
    }
  | { operator: 'ALL' | 'ANY' | 'SEQUENCE'; conditions: Condition[] };
export const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.strictObject({ type: z.literal('FACT'), reference: key }),
    z.strictObject({
      type: z.literal('OPTION'),
      sceneKey: key,
      optionKey: key,
      success: z.boolean().optional(),
    }),
    z.strictObject({
      type: z.literal('EVENT'),
      eventType: z
        .string()
        .regex(/^[A-Z][A-Z0-9_]*$/)
        .max(100),
      equals: z
        .record(
          z.string().max(100),
          z.union([z.string().max(500), z.number(), z.boolean()]),
        )
        .optional(),
    }),
    z.strictObject({
      operator: z.enum(['ALL', 'ANY', 'SEQUENCE']),
      conditions: z.array(conditionSchema).min(1).max(40),
    }),
  ]),
);
const objectiveSchema = z.strictObject({
  key,
  type: z.enum(['MAIN', 'OPTIONAL', 'CONDITIONAL', 'ALTERNATIVE']),
  description: z.string().min(1).max(3000),
  publicDescription: z.string().min(1).max(3000).optional(),
  availableWhen: conditionSchema.optional(),
  unavailableWhen: conditionSchema.optional(),
  completion: conditionSchema,
  weight: z.number().int().min(1).max(100),
});
export const unitSchema = z.strictObject({
  key,
  weight: z.number().int().min(1).max(100),
  objectives: z.array(objectiveSchema).min(1).max(40),
  milestones: z
    .array(
      z.strictObject({
        key,
        weight: z.number().int().min(1).max(100),
        completion: conditionSchema,
      }),
    )
    .min(1)
    .max(40)
    .optional(),
  completion: conditionSchema,
  terminal: conditionSchema.optional(),
});
export const progressionSchema = z.strictObject({
  facts: z
    .array(
      z.strictObject({
        key,
        unitKey: key,
        description: z.string().min(1).max(3000),
        exclusiveGroup: key.optional(),
        requires: conditionSchema.optional(),
        sourcePages: z.array(z.number().int().positive()).min(1),
      }),
    )
    .max(100),
  units: z.array(unitSchema).min(1).max(100),
});
export type Progression = z.infer<typeof progressionSchema>;
export type Unit = z.infer<typeof unitSchema>;
export interface ProgressEvidence {
  id: string;
  sequence: number;
  fact?: string;
  sceneKey?: string;
  optionKey?: string;
  success?: boolean;
  eventType?: string;
  changes?: Record<string, unknown>;
}
interface Match {
  satisfied: boolean;
  eventIds: string[];
  first: number;
  last: number;
}
const missing = (): Match => ({
  satisfied: false,
  eventIds: [],
  first: 0,
  last: 0,
});
// Evaluate from immutable, officially committed evidence only. No clock or prose inputs.
export function evaluateCondition(
  condition: Condition,
  evidence: ProgressEvidence[],
  after = -1,
): Match {
  if ('type' in condition) {
    const match = [...evidence]
      .sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id))
      .find(
        (e) =>
          e.sequence > after &&
          (condition.type === 'FACT'
            ? e.fact === condition.reference
            : condition.type === 'EVENT'
              ? e.eventType === condition.eventType &&
                Object.entries(condition.equals ?? {}).every(
                  ([k, v]) => e.changes?.[k] === v,
                )
              : e.sceneKey === condition.sceneKey &&
                e.optionKey === condition.optionKey &&
                e.success === (condition.success ?? true)),
      );
    return match
      ? {
          satisfied: true,
          eventIds: [match.id],
          first: match.sequence,
          last: match.sequence,
        }
      : missing();
  }
  const results: Match[] = [];
  for (const child of condition.conditions) {
    const result = evaluateCondition(
      child,
      evidence,
      condition.operator === 'SEQUENCE'
        ? (results.at(-1)?.last ?? after)
        : after,
    );
    results.push(result);
  }
  if (condition.operator === 'ANY')
    return (
      results
        .filter((r) => r.satisfied)
        .sort(
          (a, b) =>
            a.last - b.last ||
            a.eventIds.join().localeCompare(b.eventIds.join()),
        )[0] ?? missing()
    );
  if (!results.every((r) => r.satisfied)) return missing();
  return {
    satisfied: true,
    eventIds: [...new Set(results.flatMap((r) => r.eventIds))],
    first: Math.min(...results.map((r) => r.first)),
    last: Math.max(...results.map((r) => r.last)),
  };
}
export function evaluateUnit(
  unit: Unit,
  evidence: ProgressEvidence[],
  closed: boolean,
) {
  const terminal = unit.terminal
    ? evaluateCondition(unit.terminal, evidence)
    : missing();
  const completion = evaluateCondition(unit.completion, evidence);
  const eligible = completion.satisfied || terminal.satisfied;
  const objectives = unit.objectives.map((o) => {
    const unavailable =
      o.unavailableWhen &&
      evaluateCondition(o.unavailableWhen, evidence).satisfied;
    const available =
      !o.availableWhen ||
      evaluateCondition(o.availableWhen, evidence).satisfied;
    const match = evaluateCondition(o.completion, evidence);
    return {
      ...o,
      status: unavailable
        ? 'UNAVAILABLE'
        : !available
          ? 'LOCKED'
          : match.satisfied
            ? 'RESOLVED'
            : 'ACTIVE',
      evidenceEventIds: match.eventIds,
    };
  });
  // Milestones group alternative outcomes; optional objectives never enter the denominator.
  const milestones =
    unit.milestones ?? objectives.filter((o) => o.type === 'MAIN');
  const total = milestones.reduce((sum, m) => sum + m.weight, 0);
  const done = milestones
    .filter((m) => evaluateCondition(m.completion, evidence).satisfied)
    .reduce((sum, m) => sum + m.weight, 0);
  return {
    objectives,
    eligible,
    terminal: terminal.satisfied,
    evidenceEventIds: terminal.satisfied
      ? terminal.eventIds
      : completion.eventIds,
    progress: closed
      ? 100
      : eligible
        ? 99
        : Math.min(99, total ? Math.floor((done * 100) / total) : 0),
  };
}
