import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import {
  FraudAlertStatus,
  FraudAlertType,
} from '../entities/fraud-alert.entity';

export class FraudAlertQueryDto {
  @ApiPropertyOptional({ enum: FraudAlertStatus })
  @IsOptional()
  @IsEnum(FraudAlertStatus)
  status?: FraudAlertStatus;

  @ApiPropertyOptional({ enum: FraudAlertType })
  @IsOptional()
  @IsEnum(FraudAlertType)
  alertType?: FraudAlertType;

  @ApiPropertyOptional()
  @IsOptional()
  userId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
