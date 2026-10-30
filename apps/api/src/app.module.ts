import { GameEngineModule } from './game-engine/game-engine.module';
import { NarrativeModule } from './narrative/narrative.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { SessionsModule } from './sessions/sessions.module';
import { MessagesModule } from './messages/messages.module';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from './config/environment';
import { HealthModule } from './health/health.module';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
      validate: validateEnvironment,
    }),
    HealthModule,
    CampaignsModule,
    SessionsModule,
    MessagesModule,
    GameEngineModule,
    NarrativeModule,
  ],
})
export class AppModule {}
