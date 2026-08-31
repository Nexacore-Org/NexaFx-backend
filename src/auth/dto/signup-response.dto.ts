import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../../users/user.entity';

/**
 * User shape returned on every successful auth response
 * (verify-login-otp, verify-signup-otp, verify-2fa).
 *
 * Contract agreed between backend and frontend teams:
 * - `firstName` and `lastName` are the raw DB fields (may be null)
 * - `name` is a computed convenience field: `firstName + ' ' + lastName` trimmed.
 *   Frontend MUST use `name` for display; individual fields are available for
 *   form pre-fill or profile editing.
 * - This shape is stable — fields will not be renamed without a versioned migration.
 */
export class AuthUserResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: 'trader@nexafx.com' })
  email: string;

  @ApiPropertyOptional({ example: 'John', nullable: true })
  firstName: string | null;

  @ApiPropertyOptional({ example: 'Doe', nullable: true })
  lastName: string | null;

  /**
   * Computed full name: `firstName + ' ' + lastName` (trimmed).
   * Always present — empty string when both fields are null.
   * Frontend should use this field for all display purposes.
   */
  @ApiProperty({
    example: 'John Doe',
    description: 'Computed full name (firstName + lastName trimmed)',
  })
  name: string;

  @ApiProperty({ example: 'USER', enum: UserRole })
  role: UserRole;

  @ApiPropertyOptional({
    example: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOUJ3UHMNGUAO7UP',
    nullable: true,
  })
  walletPublicKey: string | null;
}

/**
 * Response shape for POST /auth/verify-login-otp and POST /auth/verify-2fa
 * when authentication completes successfully (no 2FA pending).
 */
export class VerifyLoginOtpResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  accessToken: string;

  @ApiProperty({ example: 'base64url-encoded-refresh-token' })
  refreshToken: string;

  @ApiProperty({ example: 900, description: 'Access token expiry in seconds' })
  expiresIn: number;

  @ApiProperty({ type: AuthUserResponseDto })
  user: AuthUserResponseDto;
}

/** @deprecated Use AuthUserResponseDto — kept for signup-specific fields (phone, isVerified, createdAt) */
export class SignupUserResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: 'trader@nexafx.com' })
  email: string;

  @ApiPropertyOptional({ example: 'John', nullable: true })
  firstName: string | null;

  @ApiPropertyOptional({ example: 'Doe', nullable: true })
  lastName: string | null;

  /**
   * Computed full name: `firstName + ' ' + lastName` (trimmed).
   * Provided for frontend convenience so consumers do not need to
   * concatenate the individual fields themselves.
   */
  @ApiProperty({
    example: 'John Doe',
    description: 'Computed full name (firstName + lastName)',
  })
  name: string;

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
