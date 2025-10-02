import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly apiKey: string | undefined;
  private readonly senderName: string;
  private readonly apiUrl: string | undefined;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('SMS_API_KEY');
    this.senderName = this.configService.get<string>('SMS_SENDER_NAME') || 'NexaFX';
    this.apiUrl = this.configService.get<string>('SMS_API_URL');
  }

  async sendVerificationCode(phoneNumber: string, code: string): Promise<boolean> {
    const message = `Your NexaFX verification code is: ${code}. This code expires in 10 minutes.`;
    try {
      if (!this.apiUrl || !this.apiKey) {
        this.logger.warn('SMS API not configured. Logging code in dev/test.');
        this.logger.debug(`[SMS MOCK] ${phoneNumber} <- ${code}`);
        return true;
      }

      const response = await axios.post(this.apiUrl, {
        to: phoneNumber,
        from: this.senderName,
        sms: message,
        type: 'plain',
        channel: 'generic',
        api_key: this.apiKey,
      });
      return Boolean((response.data as any)?.message_id);
    } catch (error: any) {
      this.logger.error(`Error sending SMS to ${phoneNumber}: ${error?.message}`);
      return false;
    }
  }
}


