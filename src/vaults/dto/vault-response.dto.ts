import { ApiProperty } from '@nestjs/swagger';
import { VaultStatus } from '../enum/vault-status.enum';
import { AutoDepositFrequency } from '../enum/auto-deposit-frequency.enum';
import { VaultTransactionType } from '../enum/vault-transaction-type.enum';

export class VaultTransactionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: VaultTransactionType })
  type: VaultTransactionType;

  @ApiProperty()
  amount: string;

  @ApiProperty()
  balanceBefore: string;

  @ApiProperty()
  balanceAfter: string;

  @ApiProperty({ nullable: true })
  note: string | null;

  @ApiProperty()
  createdAt: Date;
}

export class VaultResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  currency: string;

  @ApiProperty()
  targetAmount: string;

  @ApiProperty()
  currentBalance: string;

  @ApiProperty()
  annualInterestRate: string;

  @ApiProperty()
  accruedInterest: string;

  @ApiProperty()
  unlockAt: Date;

  @ApiProperty({ enum: VaultStatus })
  status: VaultStatus;

  @ApiProperty()
  earlyWithdrawalPenaltyPercent: string;

  @ApiProperty({ nullable: true })
  autoDepositAmount: string | null;

  @ApiProperty({ nullable: true, enum: AutoDepositFrequency })
  autoDepositFrequency: AutoDepositFrequency | null;

  @ApiProperty()
  progressPercent: number;

  @ApiProperty({ nullable: true })
  maturedAt: Date | null;

  @ApiProperty({ nullable: true })
  closedAt: Date | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({ type: [VaultTransactionResponseDto] })
  transactions: VaultTransactionResponseDto[];
}
