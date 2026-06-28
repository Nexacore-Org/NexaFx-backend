import { ApiProperty } from '@nestjs/swagger';

export class ImpersonationResponseDto {
  @ApiProperty({
    description: 'Short-lived JWT that authenticates as the target user',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  impersonationToken: string;

  @ApiProperty({
    description: 'ISO-8601 timestamp when the impersonation token expires',
    example: '2026-06-27T01:30:00.000Z',
  })
  expiresAt: string;
}

export class ActiveImpersonationSessionDto {
  @ApiProperty({ description: 'Impersonation JTI (unique token ID)' })
  jti: string;

  @ApiProperty({ description: 'ID of the user being impersonated' })
  targetUserId: string;

  @ApiProperty({ description: 'Email of the user being impersonated' })
  targetUserEmail: string;

  @ApiProperty({ description: 'ID of the admin who started the session' })
  adminId: string;

  @ApiProperty({ description: 'ISO-8601 timestamp when the session was started' })
  startedAt: string;

  @ApiProperty({ description: 'ISO-8601 timestamp when the session will expire' })
  expiresAt: string;

  @ApiProperty({ description: 'Redis key backing this session' })
  redisKey: string;
}

export class ActiveImpersonationSessionsDto {
  @ApiProperty({ type: [ActiveImpersonationSessionDto] })
  sessions: ActiveImpersonationSessionDto[];

  @ApiProperty()
  total: number;
}
