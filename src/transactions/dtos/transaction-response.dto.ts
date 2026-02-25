import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  TransactionStatus,
  TransactionType,
} from '../entities/transaction.entity';

export class TransactionResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  userId: string;

  @ApiProperty({ enum: TransactionType, example: TransactionType.DEPOSIT })
  type: TransactionType;

  @ApiProperty({ example: '100.50000000' })
  amount: string;

  @ApiProperty({ example: 'XLM' })
  currency: string;

  @ApiPropertyOptional({ example: '★' })
  currencySymbol: string;

  @ApiPropertyOptional({ example: 'Stellar Lumens' })
  currencyDisplayName: string;

  @ApiPropertyOptional({ example: '0.12345678' })
  rate: string;

  @ApiProperty({ enum: TransactionStatus, example: TransactionStatus.PENDING })
  status: TransactionStatus;

  @ApiPropertyOptional({ example: 'abc123def456...' })
  txHash: string;

  @ApiPropertyOptional({ example: 'Insufficient funds on-chain' })
  failureReason: string;

  @ApiPropertyOptional({ example: '0.50000000' })
  feeAmount: string;

  @ApiPropertyOptional({ example: 'XLM' })
  feeCurrency: string;

  @ApiProperty({ example: '2024-01-15T10:30:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-15T10:30:00.000Z' })
  updatedAt: Date;
}

export class DepositResponseDto extends TransactionResponseDto {
  @ApiProperty({
    example: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOUJ3UHMNGUAO7UP',
  })
  sourceAddress: string;
}

export class WithdrawalResponseDto extends TransactionResponseDto {
  @ApiProperty({
    example: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOUJ3UHMNGUAO7UP',
  })
  destinationAddress: string;
}

export class TransactionListResponseDto {
  @ApiProperty({ type: [TransactionResponseDto] })
  transactions: TransactionResponseDto[];

  @ApiProperty({ example: 42 })
  total: number;
}
