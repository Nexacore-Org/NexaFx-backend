import { ApiProperty } from '@nestjs/swagger';

export class ApiKeyResponseDto {
  @ApiProperty({
    description: 'The plaintext API key (shown only once)',
    example: 'nxk_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0',
  })
  key: string;

  @ApiProperty({
    description: 'API key ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({
    description: 'API key name',
    example: 'Payment Processor Webhook',
  })
  name: string;

  @ApiProperty({
    description: 'API key prefix (first 8 characters)',
    example: 'nxk_a1b2',
  })
  prefix: string;

  @ApiProperty({
    description: 'Array of scopes assigned to the key',
    example: ['webhook:receive', 'transactions:read'],
  })
  scopes: string[];

  @ApiProperty({
    description: 'Whether the key is active',
    example: true,
  })
  isActive: boolean;

  @ApiProperty({
    description: 'Expiration date (null if non-expiring)',
    example: '2026-12-31T23:59:59Z',
    nullable: true,
  })
  expiresAt: Date | null;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2026-04-23T10:00:00Z',
  })
  createdAt: Date;
}

export class ApiKeyMetadataDto {
  @ApiProperty({
    description: 'API key ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({
    description: 'API key name',
    example: 'Payment Processor Webhook',
  })
  name: string;

  @ApiProperty({
    description: 'API key prefix (first 8 characters)',
    example: 'nxk_a1b2',
  })
  prefix: string;

  @ApiProperty({
    description: 'Array of scopes assigned to the key',
    example: ['webhook:receive', 'transactions:read'],
  })
  scopes: string[];

  @ApiProperty({
    description: 'Whether the key is active',
    example: true,
  })
  isActive: boolean;

  @ApiProperty({
    description: 'Expiration date (null if non-expiring)',
    example: '2026-12-31T23:59:59Z',
    nullable: true,
  })
  expiresAt: Date | null;

  @ApiProperty({
    description: 'Last usage timestamp',
    example: '2026-04-23T12:00:00Z',
    nullable: true,
  })
  lastUsedAt: Date | null;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2026-04-23T10:00:00Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Last update timestamp',
    example: '2026-04-23T10:00:00Z',
  })
  updatedAt: Date;
}
