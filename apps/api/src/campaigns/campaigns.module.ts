import { AdventureRegistryModule } from '../adventures/adventure-registry.module';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { CampaignsController } from './campaigns.controller';
import { CampaignsRepository } from './campaigns.repository';
import { CampaignsService } from './campaigns.service';
@Module({
  imports: [DatabaseModule, AdventureRegistryModule],
  controllers: [CampaignsController],
  providers: [CampaignsRepository, CampaignsService],
  exports: [CampaignsRepository, CampaignsService],
})
export class CampaignsModule {}
