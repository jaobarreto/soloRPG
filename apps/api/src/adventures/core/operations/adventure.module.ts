import { AdventureRegistryModule } from '../../adventure-registry.module';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../../database/database.module';
import { AdventureService } from './adventure.service';
import { CampaignPreparationController } from './campaign-preparation.controller';
import { GameEngineModule } from '../../../game-engine/game-engine.module';
@Module({
  imports: [AdventureRegistryModule, DatabaseModule, GameEngineModule],
  controllers: [CampaignPreparationController],
  providers: [AdventureService],
  exports: [AdventureService],
})
export class AdventureModule {}
