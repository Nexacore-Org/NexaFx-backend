import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TransactionType } from '../entities/transaction.entity';

export class EstimateTransactionDto {
  @ApiProperty({ enum: TransactionType, example: TransactionType.WITHDRAW })
  @IsEnum(TransactionType)
  @IsNotEmpty()
  type: TransactionType;

  @ApiProperty({ example: 100, minimum: 0.01 })
  @IsNumber()
  @IsPositive()
  @Min(0.01)
  amount: number;

  @ApiProperty({ example: 'XLM' })
  @IsString()
  @IsNotEmpty()
  currency: string;

  @ApiPropertyOptional({ example: 'USDC' })
  @IsOptional()
  @IsString()
  toCurrency?: string;
}

export class EstimateConversionDto {
  @ApiProperty({ example: 'XLM' })
  @IsString()
  @IsNotEmpty()
  fromCurrency: string;

  @ApiProperty({ example: 'NGN' })
  @IsString()
  @IsNotEmpty()
  toCurrency: string;

  @ApiProperty({ example: 100, minimum: 0.01 })
  @IsNumber()
  @IsPositive()
  @Min(0.01)
  fromAmount: number;
}

export class BatchEstimateItemDto {
  @ApiProperty({ enum: TransactionType, example: TransactionType.WITHDRAW })
  @IsEnum(TransactionType)
  @IsNotEmpty()
  type: TransactionType;

  @ApiProperty({ example: 50, minimum: 0.01 })
  @IsNumber()
  @IsPositive()
  @Min(0.01)
  amount: number;

  @ApiProperty({ example: 'XLM' })
  @IsString()
  @IsNotEmpty()
  currency: string;

  @ApiPropertyOptional({ example: 'USDC' })
  @IsOptional()
  @IsString()
  toCurrency?: string;
}

export class BatchEstimateDto {
  @ApiProperty({ type: [BatchEstimateItemDto], maxItems: 20 })
  @ValidateNested({ each: true })
  @Type(() => BatchEstimateItemDto)
  @ArrayMaxSize(20)
  transactions: BatchEstimateItemDto[];
}
