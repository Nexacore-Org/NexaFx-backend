import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ example: 'trader@nexafx.com' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6)
  otp: string;

  @ApiProperty({
    example: 'NewStrongPassword!123',
    description: 'New password to set for the account.',
  })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  newPassword: string;
}

