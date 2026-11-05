import { AdventureRegistryModule } from '../adventures/adventure-registry.module';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { SessionsModule } from '../sessions/sessions.module';
import { GameEngineModule } from '../game-engine/game-engine.module';
import { AiServiceModule } from '../integrations/ai-service/ai-service.module';
import { MessagesRepository } from '../messages/messages.repository';
import { NarrativeContextService } from './context.service';
import { NarrativeResolutionService } from './resolution.service';
import { NarrativeService } from './narrative.service';
import { NarrativeController } from './narrative.controller';
@Module({
  imports: [
    AdventureRegistryModule,
    DatabaseModule,
    CampaignsModule,
    SessionsModule,
    GameEngineModule,
    AiServiceModule,
  ],
  providers: [
    MessagesRepository,
    NarrativeContextService,
    NarrativeResolutionService,
    NarrativeService,
  ],
  controllers: [NarrativeController],
})
export class NarrativeModule {}
