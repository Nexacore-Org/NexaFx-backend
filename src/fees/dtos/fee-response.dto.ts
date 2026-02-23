import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FeeTransactionType, FeeType } from '../entities/fee-config.entity';

export class FeeConfigResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({
    enum: FeeTransactionType,
    example: FeeTransactionType.WITHDRAW,
  })
  transactionType: FeeTransactionType;

  @ApiProperty({ example: 'USDC' })
  currency: string;

  @ApiProperty({ enum: FeeType, example: FeeType.PERCENTAGE })
  feeType: FeeType;

  @ApiProperty({ example: '0.50000000' })
  feeValue: string;

  @ApiPropertyOptional({ example: '0.10000000', nullable: true })
  minFee: string | null;

  @ApiPropertyOptional({ example: '50.00000000', nullable: true })
  maxFee: string | null;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ example: '2024-01-15T10:30:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-15T10:30:00.000Z' })
  updatedAt: Date;
}

export class FeeEstimateResponseDto {
  @ApiProperty({ example: '2.50000000' })
  feeAmount: string;

  @ApiProperty({ example: 'USDC' })
  feeCurrency: string;

  @ApiProperty({ enum: FeeType, example: FeeType.PERCENTAGE })
  feeType: FeeType;

  @ApiProperty({ example: '100.00000000' })
  grossAmount: string;

  @ApiProperty({ example: '97.50000000' })
  netAmount: string;
}

export class FeeBreakdownDto {
  @ApiProperty({ example: '2.50000000' })
  feeAmount: string;

  @ApiProperty({ example: 'USDC' })
  feeCurrency: string;

  @ApiProperty({ enum: FeeType, example: FeeType.PERCENTAGE })
  feeType: FeeType;
}
