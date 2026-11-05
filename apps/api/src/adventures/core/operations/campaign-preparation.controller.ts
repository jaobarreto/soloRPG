import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdventureService } from './adventure.service';

@ApiTags('Campaigns')
@Controller('campaigns/:campaignId/preparation')
export class CampaignPreparationController {
  constructor(private readonly adventures: AdventureService) {}

  @Get()
  @ApiOperation({
    summary: 'Read the adventure and its player-visible review sheets',
  })
  async detail(@Param('campaignId', ParseUUIDPipe) campaignId: string) {
    // Nest serializes null as an empty response body.
    return { adventure: await this.adventures.preparation(campaignId) };
  }

  @Post()
  @HttpCode(200)
  async prepare(@Param('campaignId', ParseUUIDPipe) campaignId: string) {
    await this.adventures.prepareParty(campaignId);
    return this.detail(campaignId);
  }

  @Post('confirm')
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['revision', 'confirmed'],
      properties: {
        revision: { type: 'string', pattern: '^[a-f0-9]{64}$' },
        confirmed: { type: 'boolean', enum: [true] },
        companions: { type: 'array', items: { type: 'string' }, maxItems: 3 },
      },
    },
  })
  @HttpCode(200)
  async confirm(
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Body() body: unknown,
  ) {
    await this.adventures.confirmParty(campaignId, body);
    return this.detail(campaignId);
  }
}
