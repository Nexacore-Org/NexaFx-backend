import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SmsService } from './sms.service';
import { RedisService } from '../redis/redis.service';

describe('SmsService', () => {
  let service: SmsService;

  const redisService = {
    getString: jest.fn(),
    setString: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmsService,
        { provide: ConfigService, useValue: { get: jest.fn((key: string) => {
          if (key === 'NODE_ENV') return 'test';
          if (key === 'SMS_OTP_EXPIRY_SECONDS') return 300;
          return undefined;
        }) } },
        { provide: RedisService, useValue: redisService },
      ],
    }).compile();
    service = module.get<SmsService>(SmsService);
  });

  it('generates a 6-digit OTP', () => {
    const otp = service.generateOtp();
    expect(otp).toMatch(/^\d{6}$/);
  });

  it('stores an OTP hash and verifies it once', async () => {
    await service.storeOtp('+2348012345678', 'phone-verify', '123456');
    expect(redisService.setString).toHaveBeenCalled();
    const ok = await service.verifyOtp('+2348012345678', 'phone-verify', '123456');
    expect(ok).toBe(true);
    expect(redisService.delete).toHaveBeenCalled();
  });

  it('rejects invalid OTPs', async () => {
    redisService.getString.mockResolvedValueOnce('hash');
    const ok = await service.verifyOtp('+2348012345678', 'phone-verify', '999999');
    expect(ok).toBe(false);
  });
});
