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
  currencySymbol?: string;

  @ApiPropertyOptional({ example: 'Stellar Lumens' })
  currencyDisplayName?: string;

  @ApiPropertyOptional({ nullable: true, example: '0.12345678' })
  rate: string | null;

  @ApiProperty({ enum: TransactionStatus, example: TransactionStatus.PENDING })
  status: TransactionStatus;

  @ApiPropertyOptional({
    nullable: true,
    example: 'abc123def456...',
  })
  txHash: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: 'Insufficient funds on-chain',
  })
  failureReason: string | null;

  @ApiPropertyOptional({ nullable: true, example: '0.50000000' })
  feeAmount: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'XLM' })
  feeCurrency: string | null;

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

export class SwapResponseDto extends TransactionResponseDto {
  @ApiProperty({ nullable: true, example: 'USDC' })
  toCurrency: string | null;

  @ApiProperty({ nullable: true, example: '12.50000000' })
  toAmount: string | null;

  @ApiProperty({
    example: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOUJ3UHMNGUAO7UP',
  })
  sourceAddress: string;
}
