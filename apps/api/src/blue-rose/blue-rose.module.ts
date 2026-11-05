import { randomInt } from 'node:crypto';
import { Module } from '@nestjs/common';
import { BlueRoseDice, RANDOM_SOURCE } from './mechanics/dice/blue-rose-dice';
import { DatabaseModule } from '../database/database.module';
import { BlueRoseTestsService } from './mechanics/tests/tests.service';
import { BlueRoseCombatService } from './mechanics/combat/combat.service';
import { BlueRoseArcanaService } from './arcana/arcana.service';
import { BlueRoseArcanaExecutionService } from './arcana/arcana-execution.service';
const mechanics = [
  BlueRoseTestsService,
  BlueRoseCombatService,
  BlueRoseArcanaService,
  BlueRoseArcanaExecutionService,
];
@Module({
  imports: [DatabaseModule],
  providers: [
    BlueRoseDice,
    ...mechanics,
    { provide: RANDOM_SOURCE, useValue: { d6: () => randomInt(1, 7) } },
  ],
  exports: [BlueRoseDice, ...mechanics],
})
export class BlueRoseModule {}
