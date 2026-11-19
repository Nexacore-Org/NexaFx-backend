import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';
import { IsStrongPassword } from './strong-password.decorator';

export class SetPasswordDto {
  @ApiProperty({
    example: '123456',
    description: '6-digit OTP for password setup verification',
  })
  @IsString()
  @Length(6, 6)
  otp: string;

  @ApiProperty({
    example: 'SecurePassword123!',
    description: 'Password (12-128 characters, max 72 UTF-8 bytes)',
  })
  @IsString()
  @IsStrongPassword()
  newPassword: string;
}
