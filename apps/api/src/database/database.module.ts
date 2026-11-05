import { Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { GameRepository } from './game.repository';
@Module({
  providers: [DatabaseService, GameRepository],
  exports: [DatabaseService, GameRepository],
})
export class DatabaseModule {}
