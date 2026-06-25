import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SavingsVaultStatus, AutoDepositFrequency } from '../entities/savings-vault.entity';
import { VaultTransactionType } from '../entities/vault-transaction.entity';

export class VaultTransactionItemDto {
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

  @ApiPropertyOptional()
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

  @ApiProperty({ enum: SavingsVaultStatus })
  status: SavingsVaultStatus;

  @ApiProperty()
  earlyWithdrawalPenaltyPercent: string;

  @ApiPropertyOptional()
  autoDepositAmount: string | null;

  @ApiPropertyOptional({ enum: AutoDepositFrequency })
  autoDepositFrequency: AutoDepositFrequency | null;

  @ApiProperty()
  progressPercent: number;

  @ApiProperty()
  createdAt: Date;

  @ApiPropertyOptional()
  maturedAt: Date | null;

  @ApiPropertyOptional()
  closedAt: Date | null;

  @ApiPropertyOptional({ type: [VaultTransactionItemDto] })
  transactions?: VaultTransactionItemDto[];
}
