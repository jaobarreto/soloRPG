// Livro básico brasileiro AGE pp.100–113, com a errata oficial v1.0.
export const bodyControlDifficulties = {
  SLEEP: 7,
  DIFFICULT_SLEEP: 9,
  HALF_BREATHING: 9,
  QUARTER_BREATHING: 13,
  IGNORE_PAIN: 11,
  BODY_AWARENESS: 11,
  FEIGN_DEATH: 13,
} as const;
export function bodyControlDifficulty(
  use: keyof typeof bodyControlDifficulties,
) {
  return bodyControlDifficulties[use];
}
export function moveObjectRule(massKg: number, fatigue: boolean) {
  if (!Number.isFinite(massKg) || massKg <= 0)
    throw new Error('Positive known mass required');
  const mass = fatigue ? massKg / 10 : massKg;
  const steps = [1, 2.5, 5, 12.5, 25, 50, 100];
  const step = steps.findIndex((limit) => mass <= limit);
  if (step < 0) throw new Error('Mass exceeds supported published table');
  return { targetNumber: 9 + 2 * step, fatigue };
}
export function windChange(total: number, current: number, requested: number) {
  if (total < 9) return current;
  const change = Math.min(
    Math.abs(requested - current),
    1 + Math.floor((total - 9) / 2),
  );
  return current + Math.sign(requested - current) * change;
}
export function sightInformation(
  total: number,
  target: number,
  knowsCaster: boolean,
) {
  const margin = total - target;
  return margin < 0
    ? 'NONE'
    : margin >= 4 && knowsCaster
      ? 'KNOWN_CASTER'
      : margin >= 2
        ? 'ARCANUM'
        : 'DISCIPLINE';
}
