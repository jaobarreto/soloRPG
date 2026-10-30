import { CampaignsModule } from '../campaigns/campaigns.module';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { SessionsModule } from '../sessions/sessions.module';
import { MessagesController } from './messages.controller';
import { MessagesRepository } from './messages.repository';
import { MessagesService } from './messages.service';
@Module({
  imports: [DatabaseModule, CampaignsModule, SessionsModule],
  controllers: [MessagesController],
  providers: [MessagesRepository, MessagesService],
})
export class MessagesModule {}
