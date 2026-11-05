// Blue Rose AGE, edição brasileira, p.30. Elapsed time is attested by the operator.
export function recoverFatigue(
  level: number,
  kind: 'BREATHER' | 'LIGHT_REST' | 'SLEEP',
): number {
  if (!Number.isInteger(level) || level < 0 || level > 3)
    throw new Error('Dying fatigue requires stabilization before rest');
  const covered = kind === 'SLEEP' ? 3 : kind === 'LIGHT_REST' ? 2 : 1;
  return level <= covered ? 0 : level;
}

// BR p.42: this bonus applies to Health recovery, never to initial/max Health.
export function recoveryConstitution(people: string, constitution: number) {
  const normalized = people
    .normalize('NFKC')
    .replaceAll('’', "'")
    .toLowerCase();
  return (
    constitution +
    (["vata'an", "vata'sha", 'vata'].includes(normalized) ? 2 : 0)
  );
}

export const restMinutes = {
  BREATHER: 5,
  LIGHT_REST: 240,
  SLEEP: 360,
} as const;
