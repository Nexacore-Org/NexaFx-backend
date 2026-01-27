import {
  TransactionStatus,
  TransactionType,
} from '../entities/transaction.entity';

export class TransactionResponseDto {
  id: string;

  userId: string;

  type: TransactionType;

  amount: string;

  currency: string;

  rate: string;

  status: TransactionStatus;

  txHash: string;

  failureReason: string;

  createdAt: Date;

  updatedAt: Date;
}

export class DepositResponseDto extends TransactionResponseDto {
  sourceAddress: string;
}

export class WithdrawalResponseDto extends TransactionResponseDto {
  destinationAddress: string;
}

export class TransactionListResponseDto {
  transactions: TransactionResponseDto[];

  total: number;
}
