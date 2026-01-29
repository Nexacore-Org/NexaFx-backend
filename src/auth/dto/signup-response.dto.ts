import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../../users/user.entity';

export class SignupUserResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: 'trader@nexafx.com' })
  email: string;

  @ApiPropertyOptional({ example: 'John', nullable: true })
  firstName: string | null;

  @ApiPropertyOptional({ example: 'Doe', nullable: true })
  lastName: string | null;

  @ApiPropertyOptional({ example: '+2348012345678', nullable: true })
  phone: string | null;

  @ApiProperty({ example: false })
  isVerified: boolean;

  @ApiProperty({ example: 'USER', enum: UserRole })
  role: UserRole;

  @ApiProperty({
    example: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOUJ3UHMNGUAO7UP',
    description: 'Stellar wallet public key (address)',
  })
  walletPublicKey: string;

  @ApiProperty({ example: '2024-01-15T10:30:00.000Z' })
  createdAt: Date;
}

export class VerifySignupResponseDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'JWT access token',
  })
  accessToken: string;

  @ApiProperty({
    example: 'base64url-encoded-refresh-token',
    description: 'Refresh token for obtaining new access tokens',
  })
  refreshToken: string;

  @ApiProperty({
    example: 900,
    description: 'Access token expiration time in seconds',
  })
  expiresIn: number;

  @ApiProperty({ type: SignupUserResponseDto })
  user: SignupUserResponseDto;
}
