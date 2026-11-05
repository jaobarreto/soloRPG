import { AdventureRegistryModule } from '../adventures/adventure-registry.module';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { SessionsModule } from '../sessions/sessions.module';
import { BlueRoseModule } from '../blue-rose/blue-rose.module';
import { MessagesRepository } from '../messages/messages.repository';
import { CharactersService } from '../characters/characters.service';
import { GameEngineService } from './game-engine.service';
import { GameEngineController } from './game-engine.controller';
@Module({
  imports: [
    AdventureRegistryModule,
    DatabaseModule,
    CampaignsModule,
    SessionsModule,
    BlueRoseModule,
  ],
  providers: [MessagesRepository, CharactersService, GameEngineService],
  controllers: [GameEngineController],
  exports: [GameEngineService],
})
export class GameEngineModule {}
