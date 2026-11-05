import { and, eq, sql } from 'drizzle-orm';
import type { Reader } from '../adventures/core/state/state';
import { sessionMessages } from '../database/schema';

import { z } from 'zod';
import { narrativeInputSchema } from '@solo-rpg/shared-contracts';

export const queuedInputSchema = z.strictObject({
  id: z.uuid(),
  interactionMode: narrativeInputSchema.shape.interactionMode,
  content: narrativeInputSchema.shape.content,
  mentions: narrativeInputSchema.shape.mentions,
});
export const batchInputSchema = z.strictObject({ id: z.uuid() });
export const queuedBatchSchema = z.object({
  sessionId: z.uuid(),
  messages: z.array(z.uuid()),
  canonicalId: z.uuid().optional(),
  sealed: z.boolean().optional(),
  leaseToken: z.uuid().optional(),
  leaseUntil: z.number().optional(),
});

export function declaredDice(text: string): [number, number, number] | null {
  const match =
    /^(?:rolei\s+)?([1-6])\s*,\s*([1-6])\s*(?:,|e)\s*([1-6])[.!]?\s*(?:o dado de drama foi\s+([1-6])[.!]?)?$/iu.exec(
      text.trim(),
    );
  if (!match || (match[4] && match[3] !== match[4])) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export const normalizeIntent = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/[.!?]+$/, '');

export async function travelPending(sessionId: string, tx: Reader) {
  const rows = await tx
    .select({ metadata: sessionMessages.metadata })
    .from(sessionMessages)
    .where(
      and(
        eq(sessionMessages.sessionId, sessionId),
        sql`(${sessionMessages.metadata}->>'travelOpening' = 'true' OR ${sessionMessages.metadata}->>'travelRevealed' = 'true')`,
      ),
    );
  return (
    rows.some((row) => row.metadata?.travelOpening === true) &&
    !rows.some((row) => row.metadata?.travelRevealed === true)
  );
}
