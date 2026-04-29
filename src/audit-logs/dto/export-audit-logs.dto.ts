import { IsString, IsOptional, IsIn, IsDateString } from 'class-validator';

export class ExportAuditLogsDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  action?: string;

  @IsIn(['PDF', 'CSV'])
  format: 'PDF' | 'CSV';
}
