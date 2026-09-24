import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FinancialCrimeReportFormat } from '../entities/financial-crime-report.entity';

export class GenerateReportDto {
  @ApiProperty({ description: 'UUID of the filed SAR to report on' })
  @IsUUID()
  sarId: string;

  @ApiPropertyOptional({
    description: 'Regulator format. Defaults to goAML 4.0 (NFIU).',
    enum: FinancialCrimeReportFormat,
    default: FinancialCrimeReportFormat.GOAML,
  })
  @IsOptional()
  @IsEnum(FinancialCrimeReportFormat)
  format?: FinancialCrimeReportFormat;
}
