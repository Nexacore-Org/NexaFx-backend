import { ApiProperty } from '@nestjs/swagger';

export class ReferralStatsDto {
  @ApiProperty()
  referralCode: string;

  @ApiProperty()
  referralCount: number;

  @ApiProperty()
  pendingRewards: number;

  @ApiProperty({
    description: 'Total earned grouped by reward currency',
    example: { USD: 25, XLM: 10 },
  })
  totalEarned: Record<string, number>;

  @ApiProperty({
    description: 'Earnings grouped by reward currency',
    example: { USD: 25, XLM: 10 },
  })
  earningsByCurrency?: Record<string, number>;
}
