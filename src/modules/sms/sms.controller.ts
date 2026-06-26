import { Body, Controller, HttpCode, HttpStatus, Post, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SmsService } from './sms.service';

class SmsOtpDto {
  phoneNumber: string;
  purpose: 'phone-verify' | '2fa' | 'txn-confirm';
}

@ApiTags('SMS')
@ApiBearerAuth('access-token')
@Controller('sms')
export class SmsController {
  constructor(private readonly smsService: SmsService) {}

  @Post('otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send an SMS OTP for a supported purpose' })
  @ApiResponse({ status: 200, description: 'OTP sent successfully' })
  async sendOtp(@Request() req: { user: { userId: string } }, @Body() body: SmsOtpDto) {
    const otp = await this.smsService.generateAndStoreOtp(body.phoneNumber, body.purpose);
    return { message: 'OTP sent successfully', otp }; 
  }
}
