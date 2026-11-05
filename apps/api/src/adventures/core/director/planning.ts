import { z } from 'zod';
import { adventureEntityId } from '../state/identity';
import { progressionSchema, unitSchema } from './progression';

const localFactSchema = progressionSchema.shape.facts.element.extend({
  proofTypes: z.array(z.string()).min(1),
});

const operationalSchema = z
  .strictObject({
    unit: unitSchema,
    sceneKeys: z.array(z.string()).min(1),
    points: z.record(z.string(), z.number().int().positive()),
    closingPoints: z.number().int().positive(),
    localFacts: z.array(localFactSchema),
  })
  .refine(
    ({ unit, points, closingPoints }) =>
      Object.values(points).reduce(
        (sum, value) => sum + value,
        closingPoints,
      ) === 100 &&
      Object.keys(points).every((key) =>
        unit.objectives.some(
          (goal) => goal.key === key && !!goal.publicDescription,
        ),
      ),
  );

export const adventurePlanningSchema = z
  .strictObject({
    revision: z.string().min(1),
    definitionId: z.string().min(1),
    sessions: z
      .array(
        z.strictObject({
          number: z.number().int().positive(),
          key: z.string().min(1),
          part: z.string().min(1),
          title: z.string().min(1),
          publicLabel: z.string().min(1),
          sourcePages: z.array(z.number().int().positive()).min(1),
          objectives: z
            .array(
              z.strictObject({
                key: z.string().min(1),
                title: z.string().min(1),
                intent: z.string().min(1),
              }),
            )
            .min(1),
          operational: operationalSchema.optional(),
        }),
      )
      .min(1),
  })
  .refine(
    ({ sessions }) =>
      sessions.every((session, index) => session.number === index + 1) &&
      new Set(sessions.map((session) => session.key)).size ===
        sessions.length &&
      new Set(
        sessions.flatMap((session) =>
          session.objectives.map((goal) => goal.key),
        ),
      ).size ===
        sessions.reduce(
          (total, session) => total + session.objectives.length,
          0,
        ),
  );

export type AdventurePlanning = z.infer<typeof adventurePlanningSchema>;

export const planningReceiptId = (campaignId: string) =>
  adventureEntityId(campaignId, 'editorial-planning-v1', 'campaign-library');
