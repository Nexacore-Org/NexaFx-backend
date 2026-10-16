import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import * as crypto from 'crypto';
import { OtpsService } from './otps.service';
import { Otp, OtpType } from './otp.entity';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.entity';

describe('OtpsService - Brute Force Lockout', () => {
  let service: OtpsService;
  let mockOtpRepository: any;
  let mockConfigService: any;
  let mockUsersService: any;

  const mockUser = (overrides: Partial<User> = {}): User =>
    ({
      id: 'user-123',
      email: 'test@example.com',
      failedLoginAttempts: 0,
      lockedUntil: null,
      ...overrides,
    }) as User;

  const hashOtp = (userId: string, type: OtpType, otp: string): string =>
    crypto
      .createHmac('sha256', process.env.OTP_SECRET ?? 'test-secret-key')
      .update(`${userId}:${type}:${otp}`)
      .digest('hex');

  beforeEach(async () => {
    mockOtpRepository = {
      findOne: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        const config: Record<string, string> = {
          OTP_SECRET: process.env.OTP_SECRET ?? 'test-secret-key',
          OTP_EXPIRES_MINUTES: '10',
          AUTH_LOCKOUT_DURATION_MINUTES: '15',
        };
        return config[key];
      }),
    };

    mockUsersService = {
      updateByUserId: jest.fn().mockResolvedValue(undefined),
      incrementFailedLoginAttempts: jest.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OtpsService,
        { provide: getRepositoryToken(Otp), useValue: mockOtpRepository },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: UsersService, useValue: mockUsersService },
      ],
    }).compile();

    service = module.get<OtpsService>(OtpsService);
  });

  describe('validateOtp', () => {
    const setupValidOtp = (code: string = '123456') => {
      mockOtpRepository.findOne.mockResolvedValue({
        id: 'otp-id',
        userId: 'user-123',
        codeHash: hashOtp('user-123', OtpType.LOGIN, code),
        usedAt: null,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });
    };

    it('should allow OTP validation when user is not locked', async () => {
      setupValidOtp();
      const result = await service.validateOtp(
        mockUser(),
        '123456',
        OtpType.LOGIN,
      );
      expect(result).toBe(true);
    });

    it('should reject OTP when user is locked', async () => {
      const lockedUser = mockUser({
        failedLoginAttempts: 5,
        lockedUntil: new Date(Date.now() + 10 * 60 * 1000),
      });

      await expect(
        service.validateOtp(lockedUser, '123456', OtpType.LOGIN),
      ).rejects.toThrow(ThrottlerException);
    });

    it('should allow OTP after lockout expires', async () => {
      const expiredLockUser = mockUser({
        failedLoginAttempts: 5,
        lockedUntil: new Date(Date.now() - 1000),
      });
      setupValidOtp();

      const result = await service.validateOtp(
        expiredLockUser,
        '123456',
        OtpType.LOGIN,
      );
      expect(result).toBe(true);
    });

    it('should increment failedLoginAttempts on wrong OTP code', async () => {
      mockOtpRepository.findOne.mockResolvedValue({
        id: 'otp-id',
        userId: 'user-123',
        codeHash: hashOtp('user-123', OtpType.LOGIN, '999999'),
        usedAt: null,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });

      await expect(
        service.validateOtp(mockUser(), '000000', OtpType.LOGIN),
      ).rejects.toThrow(UnauthorizedException);

      // Counting is delegated to an atomic UPDATE ... RETURNING in
      // UsersService, so parallel attempts cannot overwrite each other.
      expect(
        mockUsersService.incrementFailedLoginAttempts,
      ).toHaveBeenCalledWith('user-123', 5, 15);
    });

    it('should set lockedUntil when MAX_FAILED_ATTEMPTS is reached', async () => {
      mockOtpRepository.findOne.mockResolvedValue({
        id: 'otp-id',
        userId: 'user-123',
        codeHash: hashOtp('user-123', OtpType.LOGIN, '999999'),
        usedAt: null,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });

      const userAtFourthAttempt = mockUser({ failedLoginAttempts: 4 });

      await expect(
        service.validateOtp(userAtFourthAttempt, '000000', OtpType.LOGIN),
      ).rejects.toThrow(UnauthorizedException);

      expect(
        mockUsersService.incrementFailedLoginAttempts,
      ).toHaveBeenCalledWith('user-123', 5, 15);
    });

    it('should return 429 on the 6th failed attempt after 5 consecutive failures', async () => {
      mockOtpRepository.findOne.mockResolvedValue({
        id: 'otp-id',
        userId: 'user-123',
        codeHash: hashOtp('user-123', OtpType.LOGIN, '999999'),
        usedAt: null,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });

      // Mutable user object so the counter persists across calls, standing in
      // for the atomic UPDATE the real UsersService performs.
      const user = { ...mockUser() };
      mockUsersService.incrementFailedLoginAttempts.mockImplementation(
        async (userId: string, maxAttempts: number, lockoutMinutes: number) => {
          user.failedLoginAttempts = (user.failedLoginAttempts ?? 0) + 1;
          if (user.failedLoginAttempts >= maxAttempts) {
            user.lockedUntil = new Date(Date.now() + lockoutMinutes * 60_000);
          }
          return user.failedLoginAttempts;
        },
      );

      for (let i = 0; i < 5; i++) {
        await expect(
          service.validateOtp(user, '000000', OtpType.LOGIN),
        ).rejects.toThrow(UnauthorizedException);
      }

      await expect(
        service.validateOtp(user, '000000', OtpType.LOGIN),
      ).rejects.toThrow(ThrottlerException);
    });

    it('should use AUTH_LOCKOUT_DURATION_MINUTES from config', async () => {
      mockConfigService.get = jest.fn().mockImplementation((key: string) => {
        const config: Record<string, string> = {
          OTP_SECRET: process.env.OTP_SECRET ?? 'test-secret-key',
          OTP_EXPIRES_MINUTES: '10',
          AUTH_LOCKOUT_DURATION_MINUTES: '30',
        };
        return config[key];
      });

      mockOtpRepository.findOne.mockResolvedValue({
        id: 'otp-id',
        userId: 'user-123',
        codeHash: hashOtp('user-123', OtpType.LOGIN, '999999'),
        usedAt: null,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });

      const userAtFourthAttempt = mockUser({ failedLoginAttempts: 4 });

      await expect(
        service.validateOtp(userAtFourthAttempt, '000000', OtpType.LOGIN),
      ).rejects.toThrow(UnauthorizedException);

      expect(
        mockUsersService.incrementFailedLoginAttempts,
      ).toHaveBeenCalledWith('user-123', 5, 30);
    });
  });
});
