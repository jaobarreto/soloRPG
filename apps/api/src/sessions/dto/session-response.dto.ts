import { ApiProperty } from '@nestjs/swagger';
import type { CampaignSession } from '@solo-rpg/shared-contracts';
import type { SessionRecord } from '../../database/schema';
import { activeSeconds } from '../session-state';
export class SessionResponseDto implements CampaignSession {
  @ApiProperty({ type: String })
  id!: string;
  @ApiProperty({ type: String })
  campaignId!: string;
  @ApiProperty({ type: Number })
  sessionNumber!: number;
  @ApiProperty({ type: String })
  title!: string;
  @ApiProperty({ type: String, nullable: true })
  description!: string | null;
  @ApiProperty({
    type: String,
    enum: ['LOCKED', 'AVAILABLE', 'IN_PROGRESS', 'PAUSED', 'COMPLETED'],
  })
  status!: CampaignSession['status'];
  @ApiProperty({ type: Number })
  estimatedDurationMinutes!: number;
  @ApiProperty({ type: Number })
  activeDurationSeconds!: number;
  @ApiProperty({ type: String, format: 'date-time' })
  timeMeasuredAt!: string;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  startedAt!: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  resumedAt!: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  pausedAt!: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  completedAt!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    enum: ['OBJECTIVE_COMPLETED', 'NARRATIVE_PAUSE', 'PLAYER_REQUESTED'],
  })
  endingType!: CampaignSession['endingType'];
  @ApiProperty({ type: String, nullable: true })
  summary!: string | null;
  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;
  static from(row: SessionRecord, now = new Date()): SessionResponseDto {
    return {
      id: row.id,
      campaignId: row.campaignId,
      sessionNumber: row.sessionNumber,
      title: row.title,
      description: row.description,
      status: row.status,
      estimatedDurationMinutes: row.estimatedDurationMinutes,
      activeDurationSeconds: activeSeconds(row, now),
      timeMeasuredAt: now.toISOString(),
      startedAt: row.startedAt?.toISOString() ?? null,
      resumedAt: row.resumedAt?.toISOString() ?? null,
      pausedAt: row.pausedAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      endingType: row.endingType,
      summary: row.summary,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
