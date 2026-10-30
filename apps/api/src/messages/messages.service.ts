import { CampaignsRepository } from '../campaigns/campaigns.repository';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { SessionsRepository } from '../sessions/sessions.repository';
import { MessagesRepository } from './messages.repository';
import { CreateMessageDto, MessagesQueryDto } from './dto/message-input.dto';
import { MessagePageDto, MessageResponseDto } from './dto/message-response.dto';

@Injectable()
export class MessagesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly campaigns: CampaignsRepository,
    private readonly sessions: SessionsRepository,
    private readonly repository: MessagesRepository,
    private readonly config: ConfigService,
  ) {}
  async create(
    campaignId: string,
    sessionId: string,
    input: CreateMessageDto,
  ): Promise<MessageResponseDto> {
    const maxLength = this.config.getOrThrow<number>('MESSAGE_MAX_LENGTH');
    if (input.content.length > maxLength)
      throw new BadRequestException(`Message exceeds ${maxLength} characters`);
    const message = await this.database.db.transaction(async (tx) => {
      // Lock order matches lifecycle writes, including implicit FK key-share locks.
      if (!(await this.campaigns.lock(campaignId, tx)))
        throw new NotFoundException('Campaign not found');
      const session = await this.sessions.lock(campaignId, sessionId, tx);
      if (!session)
        throw new NotFoundException('Session not found in campaign');
      if (session.status !== 'IN_PROGRESS')
        throw new ConflictException(
          'Only sessions in progress accept messages',
        );
      const sequenceNumber =
        (await this.repository.lastSequence(sessionId, tx)) + 1;
      return this.repository.insert(
        {
          campaignId,
          sessionId,
          role: 'PLAYER',
          interactionMode: input.interactionMode,
          content: input.content,
          sequenceNumber,
        },
        tx,
      );
    });
    return MessageResponseDto.from(message);
  }
  async list(
    campaignId: string,
    sessionId: string,
    query: MessagesQueryDto,
  ): Promise<MessagePageDto> {
    if (!(await this.sessions.find(campaignId, sessionId)))
      throw new NotFoundException('Session not found in campaign');
    const rows = await this.repository.page(
      campaignId,
      sessionId,
      query.after,
      query.limit,
    );
    const hasMore = rows.length > query.limit;
    const data = rows.slice(0, query.limit).map(MessageResponseDto.from);
    return {
      data,
      hasMore,
      nextCursor: hasMore ? data[data.length - 1]!.sequenceNumber : null,
    };
  }
}
