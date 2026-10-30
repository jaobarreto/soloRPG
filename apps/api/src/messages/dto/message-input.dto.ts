import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsString, Matches, Max, Min } from 'class-validator';
import { InteractionMode } from '@solo-rpg/shared-contracts';
export class CreateMessageDto {
  @ApiProperty({ enum: InteractionMode })
  @IsEnum(InteractionMode)
  interactionMode!: InteractionMode;

  @ApiProperty({
    description:
      'Nonblank text, limited by MESSAGE_MAX_LENGTH (default 10000).',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Matches(/\S/u)
  content!: string;
}
export class MessagesQueryDto {
  @ApiPropertyOptional({
    default: 0,
    minimum: 0,
    description: 'Exclusive sequence cursor within this session.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  after: number = 0;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 50;
}
