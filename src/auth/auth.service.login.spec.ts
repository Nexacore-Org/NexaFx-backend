import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { I18nService } from 'nestjs-i18n';
import * as bcrypt from 'bcrypt';

import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { OtpsService, OtpType } from '../otps/otps.service';
import { RefreshTokensService } from '../tokens/refresh-tokens.service';
import { OtpDeliveryService } from './email/otp-delivery.service';
import { StellarService } from '../blockchain/stellar/stellar.service';
import { EncryptionService } from '../common/services/encryption.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../audit-logs/enums/audit-action.enum';
import { ReferralsService } from '../referrals/referrals.service';
import { TwoFactorService } from '../two-factor/two-factor.service';
import { WalletsService } from '../wallets/wallets.service';
import { UnifiedActivityFeedService } from '../unified-activity-feed/unified-activity-feed.service';
import { GdprService } from '../modules/gdpr/gdpr.service';
import { PasswordResetAttempt } from './entities/password-reset-attempt.entity';
import { OAuthAccount } from './entities/oauth-account.entity';

const EMAIL = 'victim@example.com';
const PASSWORD = 'Password123!';
const GENERIC = 'If an account exists with this email, an OTP has been sent.';

describe('AuthService login lockout', () => {
  let service: AuthService;

  const usersService = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    updateByUserId: jest.fn().mockResolvedValue(undefined),
    incrementFailedLoginAttempts: jest.fn().mockResolvedValue(1),
    clearFailedLoginAttempts: jest.fn().mockResolvedValue(undefined),
  };
  const config = {
    get: jest.fn((key: string) =>
      key === 'JWT_EXPIRES_IN' ? '15m' : undefined,
    ),
  };

  const makeUser = (overrides: Record<string, unknown> = {}) => ({
    id: 'user-1',
    email: EMAIL,
    password: null as string | null,
    isVerified: true,
    isActive: true,
    isSuspended: false,
    isDeleted: false,
    isTwoFactorEnabled: false,
    failedLoginAttempts: 0,
    lockedUntil: null as Date | null,
    ...overrides,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    usersService.incrementFailedLoginAttempts.mockResolvedValue(1);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: OtpsService, useValue: { generateOtp: jest.fn() } },
        {
          provide: RefreshTokensService,
          useValue: { createRefreshToken: jest.fn(), revokeAllUserTokens: jest.fn() },
        },
        { provide: OtpDeliveryService, useValue: { sendOtp: jest.fn() } },
        { provide: JwtService, useValue: { sign: jest.fn(), verify: jest.fn() } },
        { provide: ConfigService, useValue: config },
        { provide: StellarService, useValue: {} },
        { provide: EncryptionService, useValue: {} },
        {
          provide: AuditLogsService,
          useValue: { logAuthEvent: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: ReferralsService, useValue: {} },
        { provide: TwoFactorService, useValue: {} },
        { provide: WalletsService, useValue: {} },
        { provide: UnifiedActivityFeedService, useValue: { append: jest.fn() } },
        { provide: GdprService, useValue: {} },
        {
          provide: getRepositoryToken(PasswordResetAttempt),
          useValue: { count: jest.fn(), save: jest.fn() },
        },
        {
          provide: getRepositoryToken(OAuthAccount),
          useValue: { findOne: jest.fn(), save: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  const hashPassword = () => bcrypt.hash(PASSWORD, 4);

  describe('login', () => {
    it('counts a wrong password', async () => {
      usersService.findByEmail.mockResolvedValue(makeUser({ password: await hashPassword() }));

      const result = await service.login({ email: EMAIL, password: 'wrong' });

      // The generic response is preserved so nothing is revealed.
      expect(result).toEqual({ message: GENERIC });
      expect(usersService.incrementFailedLoginAttempts).toHaveBeenCalledWith(
        'user-1',
        5,
        15,
      );
    });

    it('honours AUTH_MAX_LOGIN_ATTEMPTS and AUTH_LOCKOUT_DURATION_MINUTES', async () => {
      config.get.mockImplementation((key: string) => {
        if (key === 'AUTH_MAX_LOGIN_ATTEMPTS') return '3';
        if (key === 'AUTH_LOCKOUT_DURATION_MINUTES') return '30';
        return undefined;
      });
      usersService.findByEmail.mockResolvedValue(makeUser({ password: await hashPassword() }));

      await service.login({ email: EMAIL, password: 'wrong' });

      expect(usersService.incrementFailedLoginAttempts).toHaveBeenCalledWith(
        'user-1',
        3,
        30,
      );
    });

    it('does not send an OTP for a wrong password', async () => {
      const generateOtp = jest.fn();
      usersService.findByEmail.mockResolvedValue(makeUser({ password: await hashPassword() }));
      const moduleRef = service as unknown as {
        otpsService: { generateOtp: jest.Mock };
      };
      moduleRef.otpsService.generateOtp = generateOtp;

      await service.login({ email: EMAIL, password: 'wrong' });

      expect(generateOtp).not.toHaveBeenCalled();
    });

    it('answers the generic message while the account is locked', async () => {
      usersService.findByEmail.mockResolvedValue(
        makeUser({
          password: await hashPassword(),
          lockedUntil: new Date(Date.now() + 5 * 60 * 1000),
        }),
      );

      const result = await service.login({ email: EMAIL, password: PASSWORD });

      expect(result).toEqual({ message: GENERIC });
      expect(usersService.incrementFailedLoginAttempts).not.toHaveBeenCalled();
    });

    it('allows a correct password once the lock has expired', async () => {
      usersService.findByEmail.mockResolvedValue(
        makeUser({
          password: await hashPassword(),
          lockedUntil: new Date(Date.now() - 1000),
        }),
      );

      const result = await service.login({ email: EMAIL, password: PASSWORD });

      expect(result.message).not.toBe(GENERIC);
    });
  });

  describe('loginV2', () => {
    const asV2 = async (password: string) =>
      service.loginV2({ email: EMAIL, password }, 'en');

    it('counts a wrong password', async () => {
      usersService.findByEmail.mockResolvedValue(makeUser({ password: await hashPassword() }));

      await expect(asV2('wrong')).rejects.toThrow(UnauthorizedException);

      expect(usersService.incrementFailedLoginAttempts).toHaveBeenCalledWith(
        'user-1',
        5,
        15,
      );
    });

    it('writes a FAILED_LOGIN audit event', async () => {
      usersService.findByEmail.mockResolvedValue(makeUser({ password: await hashPassword() }));

      await expect(asV2('wrong')).rejects.toThrow(UnauthorizedException);

      const audit = (service as unknown as {
        auditLogsService: { logAuthEvent: jest.Mock };
      }).auditLogsService.logAuthEvent;
      expect(audit).toHaveBeenCalledWith(
        'user-1',
        AuditAction.FAILED_LOGIN,
        expect.objectContaining({ reason: 'Invalid password' }),
      );
    });

    it('rejects while the account is locked', async () => {
      usersService.findByEmail.mockResolvedValue(
        makeUser({
          password: await hashPassword(),
          lockedUntil: new Date(Date.now() + 5 * 60 * 1000),
        }),
      );

      await expect(asV2(PASSWORD)).rejects.toThrow(UnauthorizedException);
      expect(usersService.incrementFailedLoginAttempts).not.toHaveBeenCalled();
    });
  });

  describe('verifyLoginOtp', () => {
    it('clears the counter once a login completes', async () => {
      usersService.findById.mockResolvedValue(
        makeUser({ isTwoFactorEnabled: false, lockedUntil: null }),
      );
      const otpsService = (service as unknown as {
        otpsService: { validateOtp: jest.Mock };
      }).otpsService;
      otpsService.validateOtp = jest.fn().mockResolvedValue(true);

      await service.verifyLoginOtp({ email: EMAIL, otp: '123456' });

      expect(usersService.updateByUserId).toHaveBeenCalledWith('user-1', {
        failedLoginAttempts: 0,
        lockedUntil: null,
      });
    });
  });

  describe('OtpType usage', () => {
    it('still generates LOGIN OTPs', () => {
      expect(OtpType.LOGIN).toBe('LOGIN');
    });
  });
});