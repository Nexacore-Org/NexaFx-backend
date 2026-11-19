import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  Matches,
  Length,
  IsBoolean,
  Equals,
} from 'class-validator';
import { IsStrongPassword } from './strong-password.decorator';

export class SignupDto {
  @ApiProperty({
    example: 'trader@nexafx.com',
    description: 'User email address (case-insensitive)',
  })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({
    example: 'SecurePassword123!',
    description: 'Password (12-128 characters, max 72 UTF-8 bytes)',
  })
  @IsString()
  @IsStrongPassword()
  password: string;

  @ApiPropertyOptional({
    example: 'John',
    description: 'User first name',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({
    example: 'Doe',
    description: 'User last name',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({
    example: '+2348012345678',
    description: 'Phone number with country code (optional)',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\+[1-9]\d{6,14}$/, {
    message: 'Phone must be in international format (e.g., +2348012345678)',
  })
  phone?: string;

  @ApiPropertyOptional({
    example: 'AB12CD34',
    description: 'Referral code from an existing user',
  })
  @IsOptional()
  @IsString()
  @Length(8, 8)
  @Matches(/^[A-Za-z0-9]{8}$/, {
    message: 'Referral code must be 8 alphanumeric characters',
  })
  referralCode?: string;

  @ApiProperty({
    example: true,
    description: 'GDPR consent acknowledgment',
  })
  @IsBoolean()
  @Equals(true, { message: 'You must consent to the privacy policy (GDPR)' })
  consentGdpr: boolean;
}
