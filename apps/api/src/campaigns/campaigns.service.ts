import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CampaignsRepository } from './campaigns.repository';
import { CreateCampaignDto, UpdateCampaignDto } from './dto/campaign-input.dto';
import {
  CampaignDetailDto,
  CampaignResponseDto,
} from './dto/campaign-response.dto';
import { SessionResponseDto } from '../sessions/dto/session-response.dto';

@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);
  constructor(private readonly repository: CampaignsRepository) {}
  async create(input: CreateCampaignDto): Promise<CampaignDetailDto> {
    const plan = Array.from({ length: input.plannedSessions }, (_, index) => ({
      sessionNumber: index + 1,
      title: `Sessão ${index + 1}`,
      status: index === 0 ? ('AVAILABLE' as const) : ('LOCKED' as const),
      estimatedDurationMinutes: input.defaultSessionDurationMinutes,
    }));
    const { campaign, sessions } = await this.repository.create(
      {
        title: input.title,
        description: input.description,
        plannedSessions: input.plannedSessions,
        defaultSessionDurationMinutes: input.defaultSessionDurationMinutes,
      },
      plan,
    );
    this.logger.log({
      event: 'campaign.created',
      campaignId: campaign.id,
      plannedSessions: campaign.plannedSessions,
    });
    return {
      ...CampaignResponseDto.from(campaign),
      sessions: sessions.map((row) => SessionResponseDto.from(row)),
    };
  }
  async list(): Promise<CampaignResponseDto[]> {
    return (await this.repository.list()).map(CampaignResponseDto.from);
  }
  async detail(id: string): Promise<CampaignDetailDto> {
    const result = await this.repository.detail(id);
    if (!result) throw new NotFoundException('Campaign not found');
    return {
      ...CampaignResponseDto.from(result.campaign),
      sessions: result.sessions.map((row) => SessionResponseDto.from(row)),
    };
  }
  async update(
    id: string,
    input: UpdateCampaignDto,
  ): Promise<CampaignResponseDto> {
    const campaign = await this.repository.update(id, {
      ...input,
      updatedAt: new Date(),
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return CampaignResponseDto.from(campaign);
  }
}
