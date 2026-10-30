import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AiServiceModule } from '../integrations/ai-service/ai-service.module';
import { HealthController } from './health.controller';
@Module({
  imports: [DatabaseModule, AiServiceModule],
  controllers: [HealthController],
})
export class HealthModule {}
