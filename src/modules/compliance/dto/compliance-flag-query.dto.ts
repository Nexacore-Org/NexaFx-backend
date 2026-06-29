import { IsOptional, IsString, IsDateString, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ComplianceFlagStatus } from '../entities/compliance-flag.entity';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ComplianceFlagQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: ComplianceFlagStatus })
  @IsOptional()
  @IsEnum(ComplianceFlagStatus)
  status?: ComplianceFlagStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rule?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;
}
