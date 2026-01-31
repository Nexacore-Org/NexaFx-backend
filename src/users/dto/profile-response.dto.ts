import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../user.entity';

export class ProfileResponseDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'Unique user identifier',
  })
  id: string;

  @ApiProperty({
    example: 'user@example.com',
    description: 'User email address',
  })
  email: string;

  @ApiPropertyOptional({
    example: 'John',
    description: 'User first name',
    nullable: true,
  })
  firstName: string | null;

  @ApiPropertyOptional({
    example: 'Doe',
    description: 'User last name',
    nullable: true,
  })
  lastName: string | null;

  @ApiPropertyOptional({
    example: '+2348012345678',
    description: 'User phone number',
    nullable: true,
  })
  phone: string | null;

  @ApiProperty({
    example: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOUJ3UHMNGUAO7UP',
    description: 'Stellar wallet public key',
  })
  walletPublicKey: string;

  @ApiProperty({
    example: true,
    description: 'Whether the user email is verified',
  })
  isVerified: boolean;

  @ApiProperty({
    example: 'USER',
    enum: UserRole,
    description: 'User role',
  })
  role: UserRole;

  @ApiProperty({
    example: '2024-01-15T10:30:00.000Z',
    description: 'Account creation timestamp',
  })
  createdAt: Date;

  @ApiProperty({
    example: '2024-01-15T10:30:00.000Z',
    description: 'Last profile update timestamp',
  })
  updatedAt: Date;
}
