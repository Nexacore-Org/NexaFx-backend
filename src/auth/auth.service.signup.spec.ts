import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { I18nService } from 'nestjs-i18n';

import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { OtpsService } from '../otps/otps.service';
import { RefreshTokensService } from '../tokens/refresh-tokens.service';
import { OtpDeliveryService } from './email/otp-delivery.service';
import { StellarService } from '../blockchain/stellar/stellar.service';
import { EncryptionService } from '../common/services/encryption.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ReferralsService } from '../referrals/referrals.service';
import { TwoFactorService } from '../two-factor/two-factor.service';
import { WalletsService } from '../wallets/wallets.service';
import { UnifiedActivityFeedService } from '../unified-activity-feed/unified-activity-feed.service';
import { GdprService } from '../modules/gdpr/gdpr.service';
import { PasswordResetAttempt } from './entities/password-reset-attempt.entity';
import { OAuthAccount } from './entities/oauth-account.entity';

const EMAIL = 'pending@example.com';

describe('AuthService signup', () => {
  let service: AuthService;

  const usersService = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    findByPhone: jest.fn(),
    findByReferralCode: jest.fn(),
    createUser: jest.fn(),
    updateByUserId: jest.fn().mockResolvedValue(undefined),
    deleteById: jest.fn().mockResolvedValue(undefined),
  };
  const otpsService = { generateOtp: jest.fn().mockReturnValue('123456'), invalidateAllUserOtps: jest.fn() };
  const otpDeliveryService = { sendOtp: jest.fn().mockResolvedValue(undefined) };
  const stellarService = {
    generateWallet: jest
      .fn()
      .mockResolvedValue({ publicKey: 'GKEY', secretKey: 'SK' }),
  };
  const walletsService = { seedPrimaryWalletFromUserCredentials: jest.fn() };
  const gdprService = { recordConsent: jest.fn() };
  const referralsService = { createPendingReferral: jest.fn() };

  const pendingUser = {
    id: 'pending-1',
    email: EMAIL,
    password: 'old-hash',
    firstName: 'Old',
    lastName: 'Name',
    phone: null,
    isVerified: false,
  };

  const dto = (overrides: Record<string, unknown> = {}) =>
    ({
      email: EMAIL,
      password: 'Password123!',
      firstName: 'New',
      lastName: 'Person',
      ...overrides,
    }) as never;

  beforeEach(async () => {
    jest.clearAllMocks();
    usersService.updateByUserId.mockResolvedValue(undefined);
    usersService.findByPhone.mockResolvedValue(null);
    usersService.findByReferralCode.mockResolvedValue(null);
    usersService.createUser.mockResolvedValue({ id: 'new-1' });
    usersService.findById.mockResolvedValue({ id: 'new-1', email: EMAIL });
    otpsService.generateOtp.mockReturnValue('123456');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: OtpsService, useValue: otpsService },
        { provide: RefreshTokensService, useValue: { createRefreshToken: jest.fn() } },
        { provide: OtpDeliveryService, useValue: otpDeliveryService },
        { provide: JwtService, useValue: { sign: jest.fn(), verify: jest.fn() } },
        {
          provide: ConfigService,
          useValue: { get: jest.fn((key: string) => (key === 'PRIVACY_POLICY_VERSION' ? '2.0' : undefined)) },
        },
        { provide: StellarService, useValue: stellarService },
        { provide: EncryptionService, useValue: { encrypt: jest.fn((v: string) => v) } },
        { provide: AuditLogsService, useValue: { logAuthEvent: jest.fn() } },
        { provide: ReferralsService, useValue: referralsService },
        { provide: TwoFactorService, useValue: {} },
        { provide: WalletsService, useValue: walletsService },
        { provide: UnifiedActivityFeedService, useValue: { append: jest.fn() } },
        { provide: GdprService, useValue: gdprService },
        {
          provide: getRepositoryToken(PasswordResetAttempt),
          useValue: { count: jest.fn().mockReturnValue(0), save: jest.fn() },
        },
        {
          provide: getRepositoryToken(OAuthAccount),
          useValue: { findOne: jest.fn(), save: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('re-signup over a pending account', () => {
    it('keeps the same user row instead of deleting it', async () => {
      usersService.findByEmail.mockResolvedValue(pendingUser);

      const result = await service.signup(dto());

      expect(usersService.deleteById).not.toHaveBeenCalled();
      expect(usersService.createUser).not.toHaveBeenCalled();
      expect(usersService.updateByUserId).toHaveBeenCalledWith(
        'pending-1',
        expect.objectContaining({ firstName: 'New', lastName: 'Person' }),
      );
      expect(result.message).toMatch(/verification code/i);
    });

    it('resends the signup OTP to the pending address', async () => {
      usersService.findByEmail.mockResolvedValue(pendingUser);

      await service.signup(dto());

      expect(otpDeliveryService.sendOtp).toHaveBeenCalledWith(
        expect.objectContaining({ email: EMAIL }),
      );
    });

    it('does not build a second wallet, consent record or referral', async () => {
      usersService.findByEmail.mockResolvedValue(pendingUser);

      await service.signup(dto({ consentGdpr: true, referralCode: 'REF123' }));

      expect(stellarService.generateWallet).not.toHaveBeenCalled();
      expect(walletsService.seedPrimaryWalletFromUserCredentials).not.toHaveBeenCalled();
      expect(gdprService.recordConsent).not.toHaveBeenCalled();
      expect(referralsService.createPendingReferral).not.toHaveBeenCalled();
    });

    it('leaves the pending account intact when the phone is taken', async () => {
      usersService.findByEmail.mockResolvedValue(pendingUser);
      usersService.findByPhone.mockResolvedValue({ id: 'other' });

      await expect(service.signup(dto({ phone: '+123' }))).rejects.toThrow(
        ConflictException,
      );
      expect(usersService.deleteById).not.toHaveBeenCalled();
      expect(usersService.updateByUserId).not.toHaveBeenCalled();
    });

    it('leaves the pending account intact when the referral code is unknown', async () => {
      usersService.findByEmail.mockResolvedValue(pendingUser);
      usersService.findByReferralCode.mockResolvedValue(null);

      await expect(
        service.signup(dto({ referralCode: 'NOPE12' })),
      ).rejects.toThrow(BadRequestException);
      expect(usersService.deleteById).not.toHaveBeenCalled();
      expect(otpDeliveryService.sendOtp).not.toHaveBeenCalled();
    });
  });

  describe('signup for a verified address', () => {
    it('returns the generic message and writes nothing', async () => {
      usersService.findByEmail.mockResolvedValue({ ...pendingUser, isVerified: true });

      const result = await service.signup(dto());

      expect(result.message).toBe(
        'this email is available, a verification code has been sent.',
      );
      expect(usersService.updateByUserId).not.toHaveBeenCalled();
      expect(usersService.deleteById).not.toHaveBeenCalled();
    });
  });
});
