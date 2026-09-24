import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const FORMATS = ['csv'] as const;

export class ExportQueryDto {
  @ApiProperty()
  @IsDateString()
  from: string;

  @ApiProperty()
  @IsDateString()
  to: string;

  @ApiPropertyOptional({ default: 'csv' })
  @IsOptional()
  @IsEnum(FORMATS)
  format?: string = 'csv';
}
