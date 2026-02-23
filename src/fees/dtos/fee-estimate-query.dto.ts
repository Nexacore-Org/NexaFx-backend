import { IsEnum, IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { FeeTransactionType } from '../entities/fee-config.entity';

export class FeeEstimateQueryDto {
  @ApiProperty({
    enum: FeeTransactionType,
    example: FeeTransactionType.WITHDRAW,
    description: 'Type of transaction to estimate fees for',
  })
  @IsEnum(FeeTransactionType)
  @IsNotEmpty()
  type: FeeTransactionType;

  @ApiProperty({
    example: 'USDC',
    description: 'Currency code',
  })
  @IsString()
  @IsNotEmpty()
  currency: string;

  @ApiProperty({
    example: 100,
    description: 'Transaction amount to estimate the fee on',
    minimum: 0.01,
  })
  @IsNumber()
  @Min(0.01)
  amount: number;
}
