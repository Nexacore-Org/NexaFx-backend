import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRedis } from '@nestjs/modules/redis'; 
import Redis from 'ioredis';
import * as crypto from 'crypto';
import * as twilio from 'twilio';

@Injectable()
export class SmsService {
  private twilioClient: twilio.Twilio | null = null;

  constructor(
    private readonly configService: ConfigService,
    @InjectRedis() private readonly redis: Redis,
  ) {
    const env = this.configService.get<string>('NODE_ENV');
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');

    if (['production', 'staging'].includes(env) && accountSid && authToken) {
      this.twilioClient = twilio(accountSid, authToken);
    }
  }

  generateOtp(): string {
    return crypto.randomInt(100000, 999999).toString();
  }

  private hashOtp(otp: string): string {
    return crypto.createHash('sha256').update(otp).digest('hex');
  }

  async checkRateLimit(phoneNumber: string): Promise<void> {
    const rateLimitKey = `nexafx:ratelimit:${phoneNumber}`;
    const requests = await this.redis.incr(rateLimitKey);

    if (requests === 1) {
      await this.redis.expire(rateLimitKey, 600); // 10-minute lock window
    }

    if (requests > 3) {
      throw new HttpException(
        'Too many OTP requests. Please try again after 10 minutes.', 
        HttpStatus.TOO_MANY_REQUESTS
      );
    }
  }

  async sendOtp(phoneNumber: string, purpose: 'phone-verify' | '2fa' | 'txn-confirm'): Promise<void> {
    await this.checkRateLimit(phoneNumber);

    const otp = this.generateOtp();
    const hashedOtp = this.hashOtp(otp);
    const ttl = this.configService.get<number>('SMS_OTP_EXPIRY_SECONDS', 300);
    const redisKey = `nexafx:otp:${phoneNumber}:${purpose}`;

    await this.redis.set(redisKey, hashedOtp, 'EX', ttl);

    if (this.configService.get<string>('NODE_ENV') === 'test' || !this.twilioClient) {
      return; 
    }

    const twilioPhoneNumber = this.configService.get<string>('TWILIO_PHONE_NUMBER');
    await this.twilioClient.messages.create({
      body: `Your NexaFx security code is: ${otp}. It expires in ${Math.floor(ttl / 60)} minutes.`,
      from: twilioPhoneNumber,
      to: phoneNumber,
    });
  }

  async verifyAndConsumeOtp(phoneNumber: string, otp: string, purpose: string): Promise<boolean> {
    const redisKey = `nexafx:otp:${phoneNumber}:${purpose}`;
    const storedHash = await this.redis.get(redisKey);

    if (!storedHash) {
      return false;
    }

    const inputHash = this.hashOtp(otp);
    if (crypto.timingSafeEqual(Buffer.from(storedHash), Buffer.from(inputHash))) {
      await this.redis.del(redisKey); // Enforce Single-Use
      return true;
    }

    return false;
  }
}