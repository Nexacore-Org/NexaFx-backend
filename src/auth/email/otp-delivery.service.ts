import { Injectable } from '@nestjs/common';
import { OtpType } from '../../otps/otp.entity';

@Injectable()
export class OtpDeliveryService {
  async sendOtp(params: {
    email: string;
    type: OtpType;
    otp: string;
  }): Promise<void> {
    void params;
  }
}
