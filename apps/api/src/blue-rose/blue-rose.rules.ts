import { randomInt } from 'node:crypto';
import { Injectable, Optional, Inject } from '@nestjs/common';
export const RANDOM_SOURCE = Symbol('BLUE_ROSE_RANDOM_SOURCE');
export interface RandomSource {
  d6(): number;
}
export interface BlueRoseDiceResult {
  dice: [number, number, number];
  dramaDie: number;
  modifier: number;
  total: number;
}
@Injectable()
export class BlueRoseDice {
  constructor(
    @Optional()
    @Inject(RANDOM_SOURCE)
    private readonly random: RandomSource = { d6: () => randomInt(1, 7) },
  ) {}
  damageDice(count: number): number[] {
    if (!Number.isInteger(count) || count < 1 || count > 10)
      throw new Error('Invalid dice count');
    return Array.from({ length: count }, () => {
      const face = this.random.d6();
      if (!Number.isInteger(face) || face < 1 || face > 6)
        throw new Error('Invalid random source');
      return face;
    });
  }
  roll(modifier = 0): BlueRoseDiceResult {
    if (!Number.isSafeInteger(modifier)) throw new Error('Invalid modifier');
    const dice: [number, number, number] = [
      this.random.d6(),
      this.random.d6(),
      this.random.d6(),
    ];
    if (dice.some((d) => !Number.isInteger(d) || d < 1 || d > 6))
      throw new Error('Invalid random source');
    return {
      dice,
      dramaDie: dice[2],
      modifier,
      total: dice[0] + dice[1] + dice[2] + modifier,
    };
  }
}
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
