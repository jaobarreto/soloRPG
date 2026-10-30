import { ApiProperty } from '@nestjs/swagger';
import type { SessionMessage } from '@solo-rpg/shared-contracts';
import type { MessageRecord } from '../../database/schema';
export class MessageResponseDto implements SessionMessage {
  @ApiProperty({ type: String })
  id!: string;
  @ApiProperty({ type: String })
  campaignId!: string;
  @ApiProperty({ type: String })
  sessionId!: string;
  @ApiProperty({ type: String, enum: ['PLAYER', 'GAME_MASTER', 'SYSTEM'] })
  role!: SessionMessage['role'];
  @ApiProperty({
    type: String,
    nullable: true,
    enum: ['SPEAK', 'ACT', 'THINK', 'OUT_OF_CHARACTER'],
  })
  interactionMode!: SessionMessage['interactionMode'];
  @ApiProperty({ type: String })
  content!: string;
  @ApiProperty({ type: Number })
  sequenceNumber!: number;
  @ApiProperty({ type: Object, nullable: true })
  metadata!: Record<string, unknown> | null;
  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
  static from(row: MessageRecord): MessageResponseDto {
    return {
      id: row.id,
      campaignId: row.campaignId,
      sessionId: row.sessionId,
      role: row.role,
      interactionMode: row.interactionMode,
      content: row.content,
      sequenceNumber: row.sequenceNumber,
      metadata: row.metadata,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

export class MessagePageDto {
  @ApiProperty({ type: [MessageResponseDto] })
  data!: MessageResponseDto[];
  @ApiProperty({ type: Number, nullable: true })
  nextCursor!: number | null;
  @ApiProperty()
  hasMore!: boolean;
}
