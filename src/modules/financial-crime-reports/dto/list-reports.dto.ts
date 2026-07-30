import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import {
  FinancialCrimeReportFormat,
  FinancialCrimeReportStatus,
} from '../entities/financial-crime-report.entity';

export class ListReportsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: FinancialCrimeReportStatus })
  @IsOptional()
  @IsEnum(FinancialCrimeReportStatus)
  status?: FinancialCrimeReportStatus;

  @ApiPropertyOptional({ enum: FinancialCrimeReportFormat })
  @IsOptional()
  @IsEnum(FinancialCrimeReportFormat)
  format?: FinancialCrimeReportFormat;

  @ApiPropertyOptional({ description: 'Filter to reports for one SAR' })
  @IsOptional()
  @IsUUID()
  sarId?: string;
}
