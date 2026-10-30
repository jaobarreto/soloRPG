import { BlueRoseTestsService } from '../blue-rose/tests.service';
import { BlueRoseCombatService } from '../blue-rose/combat.service';
import { BlueRoseArcanaService } from '../blue-rose/arcana.service';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { SessionsModule } from '../sessions/sessions.module';
import { BlueRoseModule } from '../blue-rose/blue-rose.module';
import { MessagesRepository } from '../messages/messages.repository';
import { GameRepository } from './game.repository';
import { CharactersService } from '../characters/characters.service';
import { GameEngineService } from './game-engine.service';
import { GameEngineController } from './game-engine.controller';
@Module({
  imports: [DatabaseModule, CampaignsModule, SessionsModule, BlueRoseModule],
  providers: [
    MessagesRepository,
    GameRepository,
    CharactersService,
    GameEngineService,
    BlueRoseCombatService,
    BlueRoseArcanaService,
    BlueRoseTestsService,
  ],
  controllers: [GameEngineController],
  exports: [GameEngineService],
})
export class GameEngineModule {}
