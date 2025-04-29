import { ApiProperty } from '@nestjs/swagger';

export class UserStatsDto {
  @ApiProperty({ description: 'Total number of registered users' })
  totalUsers: number;

  @ApiProperty({ description: 'Number of new users in the last 30 days' })
  newUsers: number;

  @ApiProperty({ description: 'Monthly growth rate as a percentage' })
  growthRate: number;

  @ApiProperty({ description: 'Number of active users in the last 30 days' })
  activeUsers: number;

  @ApiProperty({ description: 'Timestamp of when the stats were last updated' })
  lastUpdated: Date;
}