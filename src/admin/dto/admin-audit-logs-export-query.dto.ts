import { IsOptional, IsDateString, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AdminAuditLogsExportQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiProperty({ required: true, default: 'csv' })
  @IsString()
  format: string;
}
