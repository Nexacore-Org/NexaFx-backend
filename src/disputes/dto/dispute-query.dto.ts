import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { DisputeStatus } from '../entities/dispute.entity';
import { DisputeReason } from '../entities/dispute.entity';

export class DisputeQueryDto {
  @ApiPropertyOptional({ enum: DisputeStatus, description: 'Filter by status' })
  @IsOptional()
  @IsEnum(DisputeStatus)
  status?: DisputeStatus;

  @ApiPropertyOptional({ enum: DisputeReason, description: 'Filter by reason' })
  @IsOptional()
  @IsEnum(DisputeReason)
  reason?: DisputeReason;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page', default: 20 })
  @IsOptional()
  limit?: number;
}
