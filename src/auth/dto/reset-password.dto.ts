import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * DTO for the POST /auth/reset-password endpoint.
 *
 * Flow:
 *  1. User calls POST /auth/forgot-password with their email.
 *  2. The backend generates a 6-digit OTP and emails it to the user.
 *  3. User submits this DTO with the email they used in step 1, the OTP
 *     they received, and the new password they want to set.
 *
 * Required shape:
 * ```json
 * {
 *   "email":       "trader@nexafx.com",
 *   "otp":         "123456",
 *   "newPassword": "NewStrongPassword!123"
 * }
 * ```
 */
export class ResetPasswordDto {
  /**
   * The email address the user registered with and used when calling
   * /auth/forgot-password. Used to look up the account and verify the OTP
   * belongs to this user.
   */
  @ApiProperty({
    example: 'trader@nexafx.com',
    description: 'Email address associated with the account',
  })
  @IsEmail({}, { message: 'email must be a valid email address' })
  @IsNotEmpty({ message: 'email is required' })
  @MaxLength(255, { message: 'email must not exceed 255 characters' })
  email: string;

  /**
   * The 6-digit one-time password sent to the user's email by
   * /auth/forgot-password. OTPs expire after the configured window
   * (default 10 minutes) and are single-use.
   */
  @ApiProperty({
    example: '123456',
    description: '6-digit OTP sent to the registered email address',
  })
  @IsString({ message: 'otp must be a string' })
  @IsNotEmpty({ message: 'otp is required' })
  @Length(6, 6, { message: 'otp must be exactly 6 characters' })
  otp: string;

  /**
   * The new password to set for the account. Must be at least 12 characters
   * and no more than 128 characters.
   */
  @ApiProperty({
    example: 'NewStrongPassword!123',
    description: 'New password to set for the account (12–128 characters)',
  })
  @IsString({ message: 'newPassword must be a string' })
  @IsNotEmpty({ message: 'newPassword is required' })
  @MinLength(12, { message: 'newPassword must be at least 12 characters' })
  @MaxLength(128, { message: 'newPassword must not exceed 128 characters' })
  newPassword: string;
}
