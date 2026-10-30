import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { MessagesService } from './messages.service';
import { CreateMessageDto, MessagesQueryDto } from './dto/message-input.dto';
import { MessagePageDto, MessageResponseDto } from './dto/message-response.dto';

@ApiTags('Messages')
@ApiBadRequestResponse({ description: 'Invalid payload, UUID or cursor' })
@ApiNotFoundResponse({ description: 'Session not found in campaign' })
@Controller('campaigns/:campaignId/sessions/:sessionId/messages')
export class MessagesController {
  constructor(private readonly service: MessagesService) {}
  @Post()
  @ApiCreatedResponse({ type: MessageResponseDto })
  @ApiConflictResponse({ description: 'Session is not in progress' })
  create(
    @Param('campaignId', new ParseUUIDPipe()) campaignId: string,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Body() input: CreateMessageDto,
  ) {
    return this.service.create(campaignId, sessionId, input);
  }
  @Get()
  @ApiOkResponse({ type: MessagePageDto })
  list(
    @Param('campaignId', new ParseUUIDPipe()) campaignId: string,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Query() query: MessagesQueryDto,
  ) {
    return this.service.list(campaignId, sessionId, query);
  }
}
