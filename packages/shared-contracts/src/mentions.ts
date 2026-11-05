import { z } from 'zod';

// Offsets are UTF-16 code units, as in JavaScript textarea.selectionStart/slice.
export const mentionSchema = z.strictObject({
  type: z.enum(['CHARACTER', 'ITEM', 'WORLD']),
  entityId: z.uuid(),
  label: z.string().min(1).max(200),
  start: z.number().int().min(0).max(10000),
  end: z.number().int().min(1).max(10000),
  literal: z.string().min(2).max(201),
});
export const mentionCandidateSchema = z.strictObject({
  type: z.enum(['CHARACTER', 'ITEM', 'WORLD']),
  entityId: z.uuid(),
  label: z.string().min(1).max(200),
  availability: z.enum(['PRESENT', 'KNOWN', 'INVENTORY', 'SCENE']),
  // Public context for homonyms, never a private source-card description.
  context: z.string().max(200),
});
export type ResolvedMention = z.infer<typeof mentionSchema>;
export type MentionCandidate = z.infer<typeof mentionCandidateSchema>;
export const mentionCatalogSchema = z.strictObject({
  data: z.array(mentionCandidateSchema).max(20),
  hasMore: z.boolean(),
});
export function validMentionSpans(
  content: string,
  mentions: ResolvedMention[],
) {
  let end = 0;
  for (const m of [...mentions].sort((a, b) => a.start - b.start)) {
    const symbol = m.type === 'CHARACTER' ? '@' : '#';
    if (
      m.start < end ||
      m.end <= m.start ||
      m.end > content.length ||
      content.slice(m.start, m.end) !== m.literal ||
      m.literal !== symbol + m.label ||
      (m.start > 0 &&
        /[\p{L}\p{N}_@#]/u.test(
          Array.from(content.slice(0, m.start)).at(-1)!,
        )) ||
      (m.end < content.length &&
        /[\p{L}\p{N}_]/u.test(Array.from(content.slice(m.end))[0]!))
    )
      return false;
    end = m.end;
  }
  return true;
}
