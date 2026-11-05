import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Sse,
  Query,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiTags,
  ApiQuery,
  ApiOkResponse,
} from '@nestjs/swagger';
import { of } from 'rxjs';
import { z } from 'zod';
import {
  narrativeInputSchema,
  mentionCatalogSchema,
} from '@solo-rpg/shared-contracts';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { parseInput } from '../game-engine/validation';
import { queuedInputSchema, batchInputSchema } from './queued-interaction';
import { NarrativeService } from './narrative.service';

@ApiTags('narrative')
@Controller('campaigns/:campaignId/sessions/:sessionId')
export class NarrativeController {
  constructor(private readonly service: NarrativeService) {}
  @Post('messages/queue')
  @ApiBody({
    schema: z.toJSONSchema(queuedInputSchema, {
      target: 'openapi-3.0',
      io: 'input',
    }) as SchemaObject,
  })
  enqueue(
    @Param('campaignId', ParseUUIDPipe) c: string,
    @Param('sessionId', ParseUUIDPipe) s: string,
    @Body() input: unknown,
  ) {
    return this.service.enqueue(c, s, input);
  }
  @Post('continue')
  @ApiBody({
    schema: z.toJSONSchema(batchInputSchema, {
      target: 'openapi-3.0',
      io: 'input',
    }) as SchemaObject,
  })
  @HttpCode(200)
  continueBatch(
    @Param('campaignId', ParseUUIDPipe) c: string,
    @Param('sessionId', ParseUUIDPipe) s: string,
    @Body() input: unknown,
  ) {
    return this.service.continueBatch(c, s, input);
  }
  @Post('actions')
  @ApiOperation({
    summary:
      'Persist a player message and process an idempotent narrative action',
  })
  @ApiBody({
    schema: z.toJSONSchema(narrativeInputSchema, {
      target: 'openapi-3.0',
      io: 'input',
    }) as SchemaObject,
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
  @Get('mentions')
  @ApiQuery({ name: 'symbol', enum: ['@', '#'], required: true })
  @ApiQuery({ name: 'q', type: String, required: false })
  @ApiOkResponse({
    schema: z.toJSONSchema(mentionCatalogSchema, {
      target: 'openapi-3.0',
    }) as SchemaObject,
  })
  mentions(
    @Param('campaignId', ParseUUIDPipe) c: string,
    @Param('sessionId', ParseUUIDPipe) s: string,
    @Query() raw: unknown,
  ) {
    const input = parseInput(
      z.strictObject({
        symbol: z.enum(['@', '#']),
        q: z.string().max(200).optional(),
      }),
      raw,
    );
    return this.service.mentions(c, s, input.symbol, input.q ?? '');
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
