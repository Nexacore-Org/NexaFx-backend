import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length, MaxLength } from 'class-validator';

export class VerifyLoginOtpDto {
  @ApiProperty({ example: 'trader@nexafx.com' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({
    example: '123456',
    description: '6-digit OTP sent to the user.',
  })
  @IsString()
  @Length(6, 6)
  otp: string;
}

