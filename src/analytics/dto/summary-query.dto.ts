import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class SummaryQueryDto {
  @ApiPropertyOptional({ example: 2026, description: 'Year' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  year?: number;

  @ApiPropertyOptional({ example: 6, description: 'Month (1-12)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;
}

export class TrendsQueryDto {
  @ApiPropertyOptional({ example: 6, description: 'Number of months to look back' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  months?: number;
}

export class BalanceHistoryQueryDto {
  @ApiPropertyOptional({ example: 30, description: 'Number of days to look back' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;
}

export class ExportQueryDto {
  @ApiProperty({ description: 'Export format: csv or pdf' })
  format: 'csv' | 'pdf';

  @ApiProperty({ description: 'Start date (ISO string)' })
  from: string;

  @ApiProperty({ description: 'End date (ISO string)' })
  to: string;
}
