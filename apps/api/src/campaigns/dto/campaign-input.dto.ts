import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
export class CreateCampaignDto {
  @ApiProperty({ maxLength: 200 })
  @Transform(trim)
  @IsString()
  @Length(1, 200)
  title!: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 10000, type: String })
  @ValidateIf((_o, value) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(10000)
  description?: string | null;

  @ApiPropertyOptional({ default: 8, minimum: 1, maximum: 1000 })
  @IsInt()
  @Min(1)
  @Max(1000)
  plannedSessions: number = 8;

  @ApiPropertyOptional({ default: 120, minimum: 1, maximum: 10080 })
  @IsInt()
  @Min(1)
  @Max(10080)
  defaultSessionDurationMinutes: number = 120;
}
export class UpdateCampaignDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @ValidateIf((_o, value) => value !== undefined)
  @Transform(trim)
  @IsString()
  @Length(1, 200)
  title?: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 10000, type: String })
  @ValidateIf((_o, value) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(10000)
  description?: string | null;
}
