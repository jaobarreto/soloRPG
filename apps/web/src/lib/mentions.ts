import type {
  MentionCandidate,
  ResolvedMention,
} from '@solo-rpg/shared-contracts';

export interface MentionQuery {
  start: number;
  end: number;
  symbol: '@' | '#';
  query: string;
}
export function mentionQuery(
  content: string,
  cursor: number,
  mentions: ResolvedMention[] = [],
): MentionQuery | null {
  const match = /(?:^|[\s(])([@#])([\p{L}\p{N}\p{M} _-]{0,200})$/u.exec(
    content.slice(0, cursor),
  );
  if (!match) return null;
  const start = cursor - match[2]!.length - 1;
  if (mentions.some((m) => m.start === start && cursor >= m.end)) return null;
  return {
    start,
    end: cursor,
    symbol: match[1] as '@' | '#',
    query: match[2]!,
  };
}
export function editMentions(
  previous: string,
  next: string,
  mentions: ResolvedMention[],
): ResolvedMention[] {
  let start = 0;
  while (
    start < previous.length &&
    start < next.length &&
    previous[start] === next[start]
  )
    start++;
  let oldEnd = previous.length,
    newEnd = next.length;
  while (
    oldEnd > start &&
    newEnd > start &&
    previous[oldEnd - 1] === next[newEnd - 1]
  ) {
    oldEnd--;
    newEnd--;
  }
  const delta = newEnd - oldEnd;
  return mentions.flatMap((m) => {
    if (m.end <= start) {
      // Appending letters changes the token and invalidates the selected identity.
      if (m.end === start && /[\p{L}\p{N}_]/u.test(next[start] ?? ''))
        return [];
      return [m];
    }
    if (m.start >= oldEnd)
      return [{ ...m, start: m.start + delta, end: m.end + delta }];
    return [];
  });
}
export function selectMention(
  content: string,
  mentions: ResolvedMention[],
  query: MentionQuery,
  candidate: Pick<MentionCandidate, 'type' | 'entityId' | 'label'>,
) {
  const literal = query.symbol + candidate.label;
  const next =
    content.slice(0, query.start) + literal + ' ' + content.slice(query.end);
  const retained = editMentions(content, next, mentions);
  const mention: ResolvedMention = {
    type: candidate.type,
    entityId: candidate.entityId,
    label: candidate.label,
    start: query.start,
    end: query.start + literal.length,
    literal,
  };
  return {
    content: next,
    mentions: [...retained, mention].sort((a, b) => a.start - b.start),
    cursor: mention.end + 1,
  };
}
