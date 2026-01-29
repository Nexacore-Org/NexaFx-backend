import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length, MaxLength } from 'class-validator';

export class VerifySignupOtpDto {
  @ApiProperty({
    example: 'trader@nexafx.com',
    description: 'Email used during signup',
  })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({
    example: '123456',
    description: '6-digit OTP sent to email',
  })
  @IsString()
  @Length(6, 6)
  otp: string;
}
