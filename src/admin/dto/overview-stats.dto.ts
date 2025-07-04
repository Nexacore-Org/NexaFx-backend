// src/modules/admin/dto/overview-stats.dto.ts
import { ApiProperty } from '@nestjs/swagger';

export class OverviewStatsDto {
  @ApiProperty({ description: 'Total number of transactions', example: 5000 })
  totalTransactions: number;

  @ApiProperty({ description: 'Total revenue across all transactions', example: 250000.75 })
  totalRevenue: number;

  @ApiProperty({ description: 'Total number of registered users', example: 1200 })
  totalUsers: number;

  @ApiProperty({ description: 'Number of transactions in the last 30 days', example: 800 })
  recentTransactions: number;

  @ApiProperty({ description: 'Timestamp of when the stats were last updated', example: '2024-07-01T10:00:00Z' })
  lastUpdated: Date;
}





