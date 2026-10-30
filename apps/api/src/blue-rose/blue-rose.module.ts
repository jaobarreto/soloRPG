import { randomInt } from 'node:crypto';
import { Module } from '@nestjs/common';
import { BlueRoseDice, RANDOM_SOURCE } from './blue-rose.rules';
@Module({
  providers: [
    BlueRoseDice,
    { provide: RANDOM_SOURCE, useValue: { d6: () => randomInt(1, 7) } },
  ],
  exports: [BlueRoseDice],
})
export class BlueRoseModule {}
