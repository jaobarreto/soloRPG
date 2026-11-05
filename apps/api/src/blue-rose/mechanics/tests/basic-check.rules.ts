import type { BlueRoseDiceResult } from '../dice/blue-rose-dice';

export function resolveBasicCheck(
  roll: BlueRoseDiceResult,
  targetNumber: number,
  stuntsEligible: boolean,
) {
  if (!Number.isSafeInteger(targetNumber) || targetNumber < 1)
    throw new Error('Invalid target number');
  const success = roll.total >= targetNumber;
  return {
    success,
    stuntPoints:
      success && stuntsEligible && new Set(roll.dice).size < 3
        ? roll.dramaDie
        : 0,
  };
}
