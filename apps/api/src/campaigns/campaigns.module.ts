import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { CampaignsController } from './campaigns.controller';
import { CampaignsRepository } from './campaigns.repository';
import { CampaignsService } from './campaigns.service';
@Module({
  imports: [DatabaseModule],
  controllers: [CampaignsController],
  providers: [CampaignsRepository, CampaignsService],
  exports: [CampaignsRepository],
})
export class CampaignsModule {}
