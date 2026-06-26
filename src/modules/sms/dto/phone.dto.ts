import { IsMatches, IsString } from 'class-validator';

export class RegisterPhoneDto {
  @IsString()
  @IsMatches(/^\+[1-9]\d{1,14}$/, { 
    message: 'Phone number must follow the strict E.164 formatting standard (e.g., +1234567890).' 
  })
  phoneNumber: string;
}

export class VerifyOtpDto {
  @IsString()
  @IsMatches(/^\d{6}$/, { message: 'OTP must be exactly 6 numeric digits.' })
  otp: string;
}