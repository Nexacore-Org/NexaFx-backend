import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

export class VerifyTwoFactorDto {
  @ApiProperty({
    description: 'Temporary token returned by /auth/verify-login-otp when 2FA is required',
  })
  @IsString()
  twoFactorToken: string;

  @ApiProperty({
    example: '123456',
    description: '6-digit TOTP code from authenticator app',
  })
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, {
    message: 'TOTP code must be a 6-digit number',
  })
  totpCode: string;
}
