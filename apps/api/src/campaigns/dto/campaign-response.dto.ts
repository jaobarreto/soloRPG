import { SessionResponseDto } from '../../sessions/dto/session-response.dto';
import { ApiProperty } from '@nestjs/swagger';
import type { Campaign } from '@solo-rpg/shared-contracts';
import type { CampaignRecord } from '../../database/schema';
export class CampaignResponseDto implements Campaign {
  @ApiProperty({ type: String })
  id!: string;
  @ApiProperty({ type: String })
  title!: string;
  @ApiProperty({ type: String, nullable: true })
  description!: string | null;
  @ApiProperty({ type: Number })
  plannedSessions!: number;
  @ApiProperty({ type: Number })
  defaultSessionDurationMinutes!: number;
  @ApiProperty({ type: Number, nullable: true })
  currentSessionNumber!: number | null;
  @ApiProperty({ type: String, enum: ['DRAFT', 'ACTIVE', 'COMPLETED'] })
  status!: Campaign['status'];
  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  completedAt!: string | null;
  static from(row: CampaignRecord): CampaignResponseDto {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      plannedSessions: row.plannedSessions,
      defaultSessionDurationMinutes: row.defaultSessionDurationMinutes,
      currentSessionNumber: row.currentSessionNumber,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
    };
  }
}

export class CampaignDetailDto extends CampaignResponseDto {
  @ApiProperty({ type: [SessionResponseDto] })
  sessions!: SessionResponseDto[];
}
