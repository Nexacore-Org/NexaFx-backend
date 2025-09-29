import { ApiProperty } from '@nestjs/swagger';
import { TransactionStatus } from '../../transactions/enums/transaction-status.enum';

export class WithdrawalResponseDto {
  @ApiProperty({
    description: 'Transaction ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description: 'Transaction reference',
    example: 'WD-20240104-001',
  })
  reference: string;

  @ApiProperty({
    description: 'Withdrawal amount',
    example: 100.5,
  })
  amount: number;

  @ApiProperty({
    description: 'Currency/asset',
    example: 'USDC',
  })
  currency: string;

  @ApiProperty({
    description: 'Destination address',
    example: 'GCKFBEIYTKP6RCZNVPH73XL7XFWTEOAO7GIHS4UECXCJBDZK5DQHQY6',
  })
  destination: string;

  @ApiProperty({
    description: 'Transaction status',
    enum: TransactionStatus,
    example: TransactionStatus.PENDING,
  })
  status: TransactionStatus;

  @ApiProperty({
    description: 'Fee amount',
    example: 0,
  })
  feeAmount: number;

  @ApiProperty({
    description: 'Total amount (amount + fee)',
    example: 100.5,
  })
  totalAmount: number;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2024-01-04T10:30:00Z',
  })
  createdAt: Date;
}
