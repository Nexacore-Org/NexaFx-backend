import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { FeeTransactionType, FeeType } from '../entities/fee-config.entity';

export class UpdateFeeConfigDto {
  @ApiPropertyOptional({
    enum: FeeTransactionType,
    example: FeeTransactionType.DEPOSIT,
    description: 'Transaction type this fee applies to',
  })
  @IsOptional()
  @IsEnum(FeeTransactionType)
  transactionType?: FeeTransactionType;

  @ApiPropertyOptional({
    example: 'XLM',
    description: 'Currency code the fee applies to',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @ApiPropertyOptional({
    enum: FeeType,
    example: FeeType.FLAT,
    description: 'Whether the fee is flat or percentage-based',
  })
  @IsOptional()
  @IsEnum(FeeType)
  feeType?: FeeType;

  @ApiPropertyOptional({
    example: 1.0,
    description: 'Fee value (flat amount or percentage)',
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  feeValue?: number;

  @ApiPropertyOptional({
    example: 0.1,
    description: 'Minimum fee amount (percentage fees only)',
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  minFee?: number;

  @ApiPropertyOptional({
    example: 50,
    description: 'Maximum fee amount (percentage fees only)',
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  maxFee?: number;

  @ApiPropertyOptional({
    example: true,
    description: 'Whether this fee rule is active',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
