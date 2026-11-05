import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsString,
  IsUUID,
  Length,
  MaxLength,
  ValidateIf,
} from 'class-validator';
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
export class CreateCampaignDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Repeat the same key to recover a previously submitted creation.',
  })
  @ValidateIf((_o, value) => value !== undefined)
  @IsUUID('4')
  requestId?: string;

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
