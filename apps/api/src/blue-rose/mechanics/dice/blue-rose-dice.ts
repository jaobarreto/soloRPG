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
  source?: 'PLAYER_DECLARED';
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
  roll(modifier = 0, declared?: [number, number, number]): BlueRoseDiceResult {
    if (!Number.isSafeInteger(modifier)) throw new Error('Invalid modifier');
    const dice: [number, number, number] = declared ?? [
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
      ...(declared ? { source: 'PLAYER_DECLARED' as const } : {}),
      total: dice[0] + dice[1] + dice[2] + modifier,
    };
  }
}
