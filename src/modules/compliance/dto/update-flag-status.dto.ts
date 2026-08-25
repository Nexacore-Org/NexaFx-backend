import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ComplianceFlagStatus } from '../entities/compliance-flag.entity';

export class UpdateFlagStatusDto {
  @ApiProperty({ enum: ComplianceFlagStatus })
  @IsEnum(ComplianceFlagStatus)
  status: ComplianceFlagStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  reviewerId?: string;
}
