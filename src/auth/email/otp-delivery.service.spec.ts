import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpType } from '../../otps/otp.entity';
import { MailService } from '../../modules/mail/mail.service';
import { UsersService } from '../../users/users.service';
import { IntelligentSmsRoutingService } from '../../intelligent-sms-routing/intelligent-sms-routing.service';
import { OtpsService } from '../../otps/otps.service';
import { OtpDeliveryService } from './otp-delivery.service';

interface SendOtpParams {
  email: string;
  type: OtpType;
  otp: string;
}

interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

describe('OtpDeliveryService', () => {
  let service: OtpDeliveryService;
  let configService: { get: jest.Mock };
  let mailService: { enqueueEmail: jest.Mock };
  let usersService: { findByEmail: jest.Mock };
  let smsRoutingService: { sendSms: jest.Mock };
  let otpsService: { getOtpExpiryMinutes: jest.Mock };

  beforeEach(() => {
    configService = { get: jest.fn() };
    mailService = { enqueueEmail: jest.fn().mockResolvedValue(undefined) };
    usersService = { findByEmail: jest.fn().mockResolvedValue(null) };
    smsRoutingService = { sendSms: jest.fn().mockResolvedValue(undefined) };
    otpsService = { getOtpExpiryMinutes: jest.fn().mockReturnValue(10) };
    service = new OtpDeliveryService(
      configService as any,
      mailService as any,
      usersService as any,
      smsRoutingService as any,
      otpsService as any,
    );
    (service as any).logger = {
      log: jest.fn(),
      error: jest.fn(),
    } as unknown as Logger;
  });

  it('refuses SKIP_EMAIL_SENDING in production', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'SKIP_EMAIL_SENDING') return 'true';
      if (key === 'NODE_ENV') return 'production';
      return undefined;
    });

    await expect(
      service.sendOtp({ email: 'a@b.com', type: OtpType.LOGIN, otp: '123456' }),
    ).rejects.toThrow('SKIP_EMAIL_SENDING');
  });

  it('does not log plaintext OTP in non-production skip mode', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'SKIP_EMAIL_SENDING') return 'true';
      if (key === 'NODE_ENV') return 'development';
      return undefined;
    });
    const logSpy = (service as any).logger.log as jest.Mock;

    await service.sendOtp({
      email: 'a@b.com',
      type: OtpType.LOGIN,
      otp: '123456',
    });

    expect(logSpy).toHaveBeenCalled();
    expect(logSpy.mock.calls[0][0]).not.toContain('123456');
  });

  it('sends SMS only for verified phone or explicit opt-in and uses configured expiry', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'NODE_ENV') return 'development';
      if (key === 'ALLOW_UNVERIFIED_SMS_OTP') return 'false';
      if (key === 'MAILGUN_API_KEY') return 'k';
      if (key === 'MAILGUN_DOMAIN') return 'd';
      if (key === 'MAILGUN_FROM_EMAIL') return 'noreply@example.com';
      return undefined;
    });
    otpsService.getOtpExpiryMinutes.mockReturnValue(7);
    usersService.findByEmail.mockResolvedValue({
      phone: '+2348012345678',
      isPhoneVerified: false,
    });

    await service.sendOtp({
      email: 'a@b.com',
      type: OtpType.LOGIN,
      otp: '123456',
    });
    expect(smsRoutingService.sendSms).not.toHaveBeenCalled();

    usersService.findByEmail.mockResolvedValue({
      phone: '+2348012345678',
      isPhoneVerified: true,
    });
    await service.sendOtp({
      email: 'a@b.com',
      type: OtpType.LOGIN,
      otp: '123456',
    });
    expect(smsRoutingService.sendSms).toHaveBeenCalledWith(
      '+2348012345678',
      expect.stringContaining('7 minutes'),
    );
  });
});
