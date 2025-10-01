import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendPhoneVerificationDto {
  @ApiProperty({ example: '+2348012345678' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^\+[1-9]\d{1,14}$/u, {
    message: 'Phone number must be in E.164 format (e.g., +2348012345678)',
  })
  phoneNumber: string;
}

export class ConfirmPhoneVerificationDto {
  @ApiProperty({ example: '123456' })
  @IsNotEmpty()
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/u, { message: 'Verification code must be 6 digits' })
  verificationCode: string;
}


