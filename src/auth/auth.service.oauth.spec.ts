import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { I18nService } from 'nestjs-i18n';

import { AuthService } from './auth.service';
import { OAuthCodeService } from './oauth-code.service';
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
import { OAuthProvider } from './entities/oauth-account.entity';

const USER_ID = 'user-1';

describe('AuthService OAuth completion', () => {
  let service: AuthService;

  const makeUser = (overrides: Record<string, unknown> = {}) => ({
    id: USER_ID,
    email: 'oauth@example.com',
    firstName: 'Oa',
    lastName: 'Auth',
    role: 'USER',
    isVerified: true,
    isEmailVerified: true,
    isActive: true,
    isSuspended: false,
    isDeleted: false,
    isTwoFactorEnabled: false,
    ...overrides,
  });

  const usersService = { findById: jest.fn(), findByEmail: jest.fn(), updateByUserId: jest.fn() };
  const jwtService = { sign: jest.fn().mockReturnValue('jwt-token'), verify: jest.fn() };
  const refreshTokensService = {
    createRefreshToken: jest.fn().mockResolvedValue('refresh-token'),
    revokeAllUserTokens: jest.fn(),
  };
  const oauthCodeService = { issue: jest.fn(), consume: jest.fn() };
  const oauthAccountRepository = { create: jest.fn((d: unknown) => d), save: jest.fn(), findOne: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    jwtService.sign.mockReturnValue('jwt-token');
    refreshTokensService.createRefreshToken.mockResolvedValue('refresh-token');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: OtpsService, useValue: {} },
        { provide: RefreshTokensService, useValue: refreshTokensService },
        { provide: OtpDeliveryService, useValue: {} },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: { get: jest.fn(() => '15m') } },
        { provide: StellarService, useValue: { generateWallet: jest.fn() } },
        { provide: EncryptionService, useValue: { encrypt: jest.fn((v: string) => v) } },
        { provide: AuditLogsService, useValue: { logAuthEvent: jest.fn() } },
        { provide: ReferralsService, useValue: { createPendingReferral: jest.fn() } },
        { provide: TwoFactorService, useValue: { verifyTotpCode: jest.fn() } },
        { provide: WalletsService, useValue: { seedPrimaryWalletFromUserCredentials: jest.fn() } },
        { provide: UnifiedActivityFeedService, useValue: { append: jest.fn() } },
        { provide: GdprService, useValue: {} },
        { provide: OAuthCodeService, useValue: oauthCodeService },
        {
          provide: getRepositoryToken(PasswordResetAttempt),
          useValue: { count: jest.fn(), save: jest.fn() },
        },
        { provide: getRepositoryToken(OAuthAccount), useValue: oauthAccountRepository },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('completeOAuthLogin', () => {
    it('issues full tokens when 2FA is off', async () => {
      usersService.findById.mockResolvedValue(makeUser());

      const result = await service.completeOAuthLogin(USER_ID);

      expect(result.requiresTwoFactor).toBe(false);
      expect(result.tokens.accessToken).toBe('jwt-token');
      expect(result.tokens.refreshToken).toBe('refresh-token');
    });

    it('issues only a partial_auth token when 2FA is enabled', async () => {
      usersService.findById.mockResolvedValue(makeUser({ isTwoFactorEnabled: true }));

      const result = await service.completeOAuthLogin(USER_ID);

      expect(result.requiresTwoFactor).toBe(true);
      expect(result.tokens.refreshToken).toBeUndefined();
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ sub: USER_ID, authStage: 'partial_auth' }),
        { expiresIn: '5m' },
      );
      expect(refreshTokensService.createRefreshToken).not.toHaveBeenCalled();
    });

    it('rejects a suspended account', async () => {
      usersService.findById.mockResolvedValue(makeUser({ isSuspended: true }));

      await expect(service.completeOAuthLogin(USER_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects a deactivated account', async () => {
      usersService.findById.mockResolvedValue(makeUser({ isActive: false }));

      await expect(service.completeOAuthLogin(USER_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects a deleted account', async () => {
      usersService.findById.mockResolvedValue(makeUser({ isDeleted: true }));

      await expect(service.completeOAuthLogin(USER_ID)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects an unverified account', async () => {
      usersService.findById.mockResolvedValue(makeUser({ isVerified: false }));

      await expect(service.completeOAuthLogin(USER_ID)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('exchangeOauthCode', () => {
    it('returns tokens for a valid code', async () => {
      usersService.findById.mockResolvedValue(makeUser());
      oauthCodeService.consume.mockResolvedValue({
        userId: USER_ID,
        requiresTwoFactor: false,
        isNew: false,
      });

      const result = await service.exchangeOauthCode('valid-code');

      expect(result.accessToken).toBe('jwt-token');
      expect(oauthCodeService.consume).toHaveBeenCalledWith('valid-code');
    });

    it('returns a partial token for a 2FA account', async () => {
      usersService.findById.mockResolvedValue(makeUser({ isTwoFactorEnabled: true }));
      oauthCodeService.consume.mockResolvedValue({
        userId: USER_ID,
        requiresTwoFactor: true,
        isNew: false,
      });

      const result = await service.exchangeOauthCode('valid-code');

      expect((result as { requiresTwoFactor?: boolean }).requiresTwoFactor).toBe(true);
      expect(result.refreshToken).toBeUndefined();
      expect(refreshTokensService.createRefreshToken).not.toHaveBeenCalled();
    });

    it('rejects an unknown or already used code', async () => {
      oauthCodeService.consume.mockResolvedValue(null);

      await expect(service.exchangeOauthCode('used')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a code for a suspended account', async () => {
      usersService.findById.mockResolvedValue(makeUser({ isSuspended: true }));
      oauthCodeService.consume.mockResolvedValue({
        userId: USER_ID,
        requiresTwoFactor: false,
        isNew: false,
      });

      await expect(service.exchangeOauthCode('code')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('handleOAuthLogin account linking', () => {
    const params = {
      provider: OAuthProvider.GOOGLE,
      providerAccountId: 'google-1',
      email: 'victim@example.com',
      firstName: 'Vic',
      lastName: 'Tim',
      accessToken: 'at',
      refreshToken: null,
      profile: {},
    };

    it('refuses to auto-link to a local account whose email is not verified', async () => {
      usersService.findByEmail.mockResolvedValue(
        makeUser({ isEmailVerified: false }),
      );

      await expect(service.handleOAuthLogin(params)).rejects.toThrow(
        ConflictException,
      );
      expect(oauthAccountRepository.save).not.toHaveBeenCalled();
    });

    it('links a verified local account as before', async () => {
      usersService.findByEmail.mockResolvedValue(makeUser());

      const result = await service.handleOAuthLogin(params);

      expect(result.isNew).toBe(false);
      expect(oauthAccountRepository.save).toHaveBeenCalled();
    });
  });
});