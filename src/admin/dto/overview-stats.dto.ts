// src/modules/admin/dto/overview-stats.dto.ts
import { ApiProperty } from '@nestjs/swagger';

export class OverviewStatsDto {
  @ApiProperty({ description: 'Total number of transactions' })
  totalTransactions: number;

  @ApiProperty({ description: 'Total revenue across all transactions' })
  totalRevenue: number;

  @ApiProperty({ description: 'Total number of registered users' })
  totalUsers: number;

  @ApiProperty({ description: 'Number of transactions in the last 30 days' })
  recentTransactions: number;

  @ApiProperty({ description: 'Timestamp of when the stats were last updated' })
  lastUpdated: Date;
}





