import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FeeTransactionType, FeeType } from '../entities/fee-config.entity';

export class CreateFeeConfigDto {
  @ApiProperty({
    enum: FeeTransactionType,
    example: FeeTransactionType.WITHDRAW,
    description: 'Transaction type this fee applies to',
  })
  @IsEnum(FeeTransactionType)
  @IsNotEmpty()
  transactionType: FeeTransactionType;

  @ApiProperty({
    example: 'USDC',
    description: 'Currency code the fee applies to',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  currency: string;

  @ApiProperty({
    enum: FeeType,
    example: FeeType.PERCENTAGE,
    description:
      'Whether the fee is a flat amount or a percentage of the transaction',
  })
  @IsEnum(FeeType)
  @IsNotEmpty()
  feeType: FeeType;

  @ApiProperty({
    example: 0.5,
    description:
      'Fee value — flat amount in currency units, or percentage (e.g. 0.5 = 0.5%)',
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  feeValue: number;

  @ApiPropertyOptional({
    example: 0.1,
    description: 'Minimum fee amount (only meaningful for percentage fees)',
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  minFee?: number;

  @ApiPropertyOptional({
    example: 50,
    description: 'Maximum fee amount (only meaningful for percentage fees)',
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  maxFee?: number;
}
