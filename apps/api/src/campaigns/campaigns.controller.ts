import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto, UpdateCampaignDto } from './dto/campaign-input.dto';
import {
  CampaignDetailDto,
  CampaignResponseDto,
} from './dto/campaign-response.dto';

@ApiTags('Campaigns')
@ApiBadRequestResponse({ description: 'Invalid payload or UUID' })
@ApiNotFoundResponse({ description: 'Campaign not found' })
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly service: CampaignsService) {}
  @Post()
  @ApiCreatedResponse({ type: CampaignDetailDto })
  create(@Body() input: CreateCampaignDto) {
    return this.service.create(input);
  }
  @Get()
  @ApiOkResponse({ type: [CampaignResponseDto] })
  list() {
    return this.service.list();
  }
  @Get('library')
  library() {
    return this.service.library();
  }
  @Post('library')
  @HttpCode(200)
  openLibraryAdventure() {
    return this.service.library(true);
  }
  @Get(':campaignId')
  @ApiOkResponse({ type: CampaignDetailDto })
  detail(@Param('campaignId', new ParseUUIDPipe()) id: string) {
    return this.service.detail(id);
  }
  @Patch(':campaignId')
  @ApiOkResponse({ type: CampaignResponseDto })
  update(
    @Param('campaignId', new ParseUUIDPipe()) id: string,
    @Body() input: UpdateCampaignDto,
  ) {
    return this.service.update(id, input);
  }
}
