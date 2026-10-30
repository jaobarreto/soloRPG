import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Sse,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { of } from 'rxjs';
import { z } from 'zod';
import { parseInput } from '../game-engine/validation';
import { NarrativeService } from './narrative.service';

@ApiTags('narrative')
@Controller('campaigns/:campaignId/sessions/:sessionId')
export class NarrativeController {
  constructor(private readonly service: NarrativeService) {}
  @Post('actions')
  @ApiOperation({
    summary:
      'Persist a player message and process an idempotent narrative action',
  })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['actionId', 'interactionMode', 'content'],
      properties: {
        actionId: { type: 'string', format: 'uuid' },
        optionId: {
          type: 'string',
          format: 'uuid',
          description: 'Prepared action explicitly selected by the player',
        },
        interactionMode: {
          type: 'string',
          enum: ['SPEAK', 'ACT', 'THINK', 'OUT_OF_CHARACTER'],
        },
        content: { type: 'string', minLength: 1, maxLength: 10000 },
      },
    },
  })
  create(
    @Param('campaignId', ParseUUIDPipe) c: string,
    @Param('sessionId', ParseUUIDPipe) s: string,
    @Body() input: unknown,
  ) {
    return this.service.create(c, s, input);
  }
  @Get('actions/:actionId')
  get(
    @Param('campaignId', ParseUUIDPipe) c: string,
    @Param('sessionId', ParseUUIDPipe) s: string,
    @Param('actionId', ParseUUIDPipe) a: string,
  ) {
    return this.service.get(c, s, a);
  }
  @Post('actions/:actionId/retry')
  @HttpCode(200)
  retry(
    @Param('campaignId', ParseUUIDPipe) c: string,
    @Param('sessionId', ParseUUIDPipe) s: string,
    @Param('actionId', ParseUUIDPipe) a: string,
    @Body() input: unknown,
  ) {
    parseInput(z.strictObject({}), input);
    return this.service.retry(c, s, a);
  }
  @Post('actions/:actionId/roll')
  @HttpCode(200)
  roll(
    @Param('campaignId', ParseUUIDPipe) c: string,
    @Param('sessionId', ParseUUIDPipe) s: string,
    @Param('actionId', ParseUUIDPipe) a: string,
    @Body() input: unknown,
  ) {
    parseInput(z.strictObject({}), input);
    return this.service.resume(c, s, a, 'roll');
  }
  @Post('actions/:actionId/decline-npc-stunts')
  @HttpCode(200)
  stunts(
    @Param('campaignId', ParseUUIDPipe) c: string,
    @Param('sessionId', ParseUUIDPipe) s: string,
    @Param('actionId', ParseUUIDPipe) a: string,
    @Body() input: unknown,
  ) {
    parseInput(z.strictObject({}), input);
    return this.service.resume(c, s, a, 'stunts');
  }
  @Post('actions/:actionId/cancel')
  @HttpCode(200)
  cancel(
    @Param('campaignId', ParseUUIDPipe) c: string,
    @Param('sessionId', ParseUUIDPipe) s: string,
    @Param('actionId', ParseUUIDPipe) a: string,
    @Body() input: unknown,
  ) {
    parseInput(z.strictObject({}), input);
    return this.service.cancel(c, s, a);
  }
  @Get('narrative-state')
  state(
    @Param('campaignId', ParseUUIDPipe) c: string,
    @Param('sessionId', ParseUUIDPipe) s: string,
  ) {
    return this.service.state(c, s);
  }
  @Get('summary')
  summary(
    @Param('campaignId', ParseUUIDPipe) c: string,
    @Param('sessionId', ParseUUIDPipe) s: string,
  ) {
    return this.service.summary(c, s);
  }
  @Get('ai-usage')
  usage(
    @Param('campaignId', ParseUUIDPipe) c: string,
    @Param('sessionId', ParseUUIDPipe) s: string,
  ) {
    return this.service.usage(c, s);
  }
  @Post('finalize')
  @HttpCode(200)
  finalize(
    @Param('campaignId', ParseUUIDPipe) c: string,
    @Param('sessionId', ParseUUIDPipe) s: string,
    @Body() input: unknown,
  ) {
    const body = parseInput(
      z.strictObject({
        endingType: z.enum([
          'OBJECTIVE_COMPLETED',
          'NARRATIVE_PAUSE',
          'PLAYER_REQUESTED',
        ]),
      }),
      input,
    );
    return this.service.finalize(c, s, body.endingType);
  }
  @Sse('actions/:actionId/stream')
  @ApiOperation({
    summary:
      'Replay the persisted action status; never executes a workflow or streams uncommitted tokens',
  })
  async stream(
    @Param('campaignId', ParseUUIDPipe) c: string,
    @Param('sessionId', ParseUUIDPipe) s: string,
    @Param('actionId', ParseUUIDPipe) a: string,
  ) {
    const data = await this.service.get(c, s, a);
    return of({ id: `${a}:${data.status}`, type: 'action', data });
  }
}
