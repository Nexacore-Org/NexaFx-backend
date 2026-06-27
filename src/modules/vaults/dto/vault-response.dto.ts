import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VaultTransactionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  vaultId: string;

  @ApiProperty()
  type: string;

  @ApiProperty()
  amount: string;

  @ApiProperty()
  balanceBefore: string;

  @ApiProperty()
  balanceAfter: string;

  @ApiPropertyOptional()
  note?: string;

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

  @ApiProperty()
  status: string;

  @ApiProperty()
  earlyWithdrawalPenaltyPercent: string;

  @ApiPropertyOptional()
  autoDepositAmount?: string;

  @ApiPropertyOptional()
  autoDepositFrequency?: string;

  @ApiProperty()
  progressPercent: number;

  @ApiProperty()
  createdAt: Date;

  @ApiPropertyOptional()
  maturedAt?: Date;

  @ApiPropertyOptional()
  closedAt?: Date;
}

export class VaultDetailResponseDto extends VaultResponseDto {
  @ApiProperty({ type: [VaultTransactionResponseDto] })
  transactions: VaultTransactionResponseDto[];
}

export class PaginatedVaultResponseDto {
  @ApiProperty({ type: [VaultResponseDto] })
  data: VaultResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  totalPages: number;
}
