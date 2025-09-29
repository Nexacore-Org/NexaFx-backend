import { ApiProperty } from '@nestjs/swagger';

export class UserStatsDto {
  @ApiProperty({
    description: 'Total number of registered users',
    example: 1200,
  })
  totalUsers: number;

  @ApiProperty({
    description: 'Number of new users in the last 30 days',
    example: 150,
  })
  newUsers: number;

  @ApiProperty({
    description: 'Monthly growth rate as a percentage',
    example: 12.5,
  })
  growthRate: number;

  @ApiProperty({
    description: 'Number of active users in the last 30 days',
    example: 900,
  })
  activeUsers: number;

  @ApiProperty({
    description: 'Timestamp of when the stats were last updated',
    example: '2024-07-01T10:00:00Z',
  })
  lastUpdated: Date;
}
