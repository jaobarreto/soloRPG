import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { EndingType } from '@solo-rpg/shared-contracts';
export class CompleteSessionDto {
  @ApiProperty({ enum: EndingType })
  @IsEnum(EndingType)
  endingType!: EndingType;
}
