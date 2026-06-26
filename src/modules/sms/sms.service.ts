import { Injectable, Logger, TooManyRequestsException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomInt } from 'crypto';
import { RedisService } from '../redis/redis.service';
import { Twilio } from 'twilio';

export type SmsOtpPurpose = 'phone-verify' | '2fa' | 'txn-confirm';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly twilioClient?: Twilio;
  private readonly isEnabled: boolean;
  private readonly otpExpirySeconds: number;
  private readonly rateLimitWindowSeconds = 600;
  private readonly rateLimitMaxRequests = 3;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    const nodeEnv = this.configService.get<string>('NODE_ENV') ?? 'development';
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
    const phoneNumber = this.configService.get<string>('TWILIO_PHONE_NUMBER');

    this.otpExpirySeconds = Number(
      this.configService.get<number>('SMS_OTP_EXPIRY_SECONDS') ?? 300,
    );

    this.isEnabled = ['production', 'staging'].includes(nodeEnv);

    if (this.isEnabled && accountSid && authToken && phoneNumber) {
      this.twilioClient = new Twilio(accountSid, authToken);
    }
  }

  generateOtp(): string {
    return randomInt(100000, 999999).toString();
  }

  async sendOtp(phoneNumber: string, otp: string): Promise<void> {
    const nodeEnv = this.configService.get<string>('NODE_ENV') ?? 'development';
    if (nodeEnv === 'test') {
      this.logger.log(`Twilio SMS mock delivery for ${phoneNumber}`);
      return;
    }

    if (!this.twilioClient) {
      this.logger.warn('Twilio client is not configured; skipping SMS delivery');
      return;
    }

    await this.twilioClient.messages.create({
      body: `Your NexaFX verification code is ${otp}`,
      from: this.configService.get<string>('TWILIO_PHONE_NUMBER') ?? '',
      to: phoneNumber,
    });
  }

  async storeOtp(phoneNumber: string, purpose: SmsOtpPurpose, otp: string): Promise<void> {
    const normalizedPhone = this.normalizePhone(phoneNumber);
    const otpHash = this.hashOtp(otp);
    const key = this.otpKey(normalizedPhone, purpose);
    await this.redisService.setString(key, otpHash, this.otpExpirySeconds);
  }

  async verifyOtp(phoneNumber: string, purpose: SmsOtpPurpose, otp: string): Promise<boolean> {
    const normalizedPhone = this.normalizePhone(phoneNumber);
    const key = this.otpKey(normalizedPhone, purpose);
    const storedHash = await this.redisService.getString(key);
    if (!storedHash) {
      return false;
    }
    const isMatch = this.hashOtp(otp) === storedHash;
    if (isMatch) {
      await this.redisService.delete(key);
    }
    return isMatch;
  }

  async consumeOtp(phoneNumber: string, purpose: SmsOtpPurpose, otp: string): Promise<boolean> {
    return this.verifyOtp(phoneNumber, purpose, otp);
  }

  async enforceRateLimit(phoneNumber: string, purpose: SmsOtpPurpose): Promise<void> {
    const normalizedPhone = this.normalizePhone(phoneNumber);
    const rateKey = this.rateLimitKey(normalizedPhone, purpose);
    const current = Number(await this.redisService.getString(rateKey) ?? '0');
    if (current >= this.rateLimitMaxRequests) {
      throw new TooManyRequestsException('Too many OTP requests. Please try again later.');
    }
    await this.redisService.setString(rateKey, String(current + 1), this.rateLimitWindowSeconds);
  }

  async generateAndStoreOtp(phoneNumber: string, purpose: SmsOtpPurpose): Promise<string> {
    this.validatePhone(phoneNumber);
    await this.enforceRateLimit(phoneNumber, purpose);
    const otp = this.generateOtp();
    await this.storeOtp(phoneNumber, purpose, otp);
    await this.sendOtp(phoneNumber, otp);
    return otp;
  }

  normalizePhone(phoneNumber: string): string {
    return phoneNumber.trim().toUpperCase();
  }

  validatePhone(phoneNumber: string): void {
    const e164 = /^\+[1-9]\d{1,14}$/;
    if (!e164.test(phoneNumber)) {
      throw new BadRequestException('Phone number must be in E.164 format');
    }
  }

  private hashOtp(otp: string): string {
    return createHash('sha256').update(otp).digest('hex');
  }

  private otpKey(phoneNumber: string, purpose: SmsOtpPurpose): string {
    return `nexafx:otp:${phoneNumber}:${purpose}`;
  }

  private rateLimitKey(phoneNumber: string, purpose: SmsOtpPurpose): string {
    return `nexafx:otp-rate:${phoneNumber}:${purpose}`;
  }
}
