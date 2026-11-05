import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  CampaignsService,
  ResetSessionResponseDto,
} from '../campaigns/campaigns.service';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SessionsService } from './sessions.service';
import { CompleteSessionDto } from './dto/complete-session.dto';
import { SessionResponseDto } from './dto/session-response.dto';

class ResetSessionDto {
  @ApiProperty({ type: Boolean, example: true })
  @IsBoolean()
  confirm!: boolean;
}

@ApiTags('Sessions')
@ApiBadRequestResponse({ description: 'Invalid payload or UUID' })
@ApiNotFoundResponse({ description: 'Session or campaign not found' })
@ApiConflictResponse({
  description: 'Invalid or repeated state transition (no changes applied)',
})
@Controller('campaigns/:campaignId/sessions')
export class SessionsController {
  constructor(
    private readonly service: SessionsService,
    private readonly campaigns: CampaignsService,
  ) {}
  @Get()
  @ApiOkResponse({ type: [SessionResponseDto] })
  list(@Param('campaignId', new ParseUUIDPipe()) campaignId: string) {
    return this.service.list(campaignId);
  }
  @Get(':sessionId')
  @ApiOkResponse({ type: SessionResponseDto })
  detail(
    @Param('campaignId', new ParseUUIDPipe()) campaignId: string,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
  ) {
    return this.service.detail(campaignId, sessionId);
  }
  @Post(':sessionId/reset')
  @HttpCode(200)
  @ApiOkResponse({ type: ResetSessionResponseDto })
  reset(
    @Param('campaignId', new ParseUUIDPipe()) campaignId: string,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Body() confirmation: ResetSessionDto,
  ) {
    return this.campaigns.resetLibrarySession(
      campaignId,
      sessionId,
      confirmation.confirm,
    );
  }
  @Post(':sessionId/start')
  @HttpCode(200)
  @ApiOkResponse({ type: SessionResponseDto })
  start(
    @Param('campaignId', new ParseUUIDPipe()) campaignId: string,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
  ) {
    return this.service.transition(campaignId, sessionId, 'start');
  }
  @Post(':sessionId/pause')
  @HttpCode(200)
  @ApiOkResponse({ type: SessionResponseDto })
  pause(
    @Param('campaignId', new ParseUUIDPipe()) campaignId: string,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
  ) {
    return this.service.transition(campaignId, sessionId, 'pause');
  }
  @Post(':sessionId/resume')
  @HttpCode(200)
  @ApiOkResponse({ type: SessionResponseDto })
  resume(
    @Param('campaignId', new ParseUUIDPipe()) campaignId: string,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
  ) {
    return this.service.transition(campaignId, sessionId, 'resume');
  }
  @Post(':sessionId/complete')
  @HttpCode(200)
  @ApiOkResponse({ type: SessionResponseDto })
  complete(
    @Param('campaignId', new ParseUUIDPipe()) campaignId: string,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Body() input: CompleteSessionDto,
  ) {
    return this.service.transition(
      campaignId,
      sessionId,
      'complete',
      input.endingType,
    );
  }
}
