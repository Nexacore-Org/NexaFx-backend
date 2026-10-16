/**
 * Unit tests for AuthService.logout().
 *
 * Logout used to receive the access token's `jti` and hand it to
 * revokeRefreshToken(), which HMAC-hashes the value and looks it up as a
 * refresh token. Access tokens are signed without a jti, so nothing was ever
 * revoked and the refresh token kept working for its full lifetime. The
 * endpoint now takes the refresh token in the body and verifies ownership.
 *
 * Covers:
 *  - own token: revoked, audited, 200 message
 *  - foreign token: 401 and no revocation
 *  - unknown / already-revoked token: 401 from validateRefreshToken
 */

import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
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
import { AuditAction } from '../audit-logs/enums/audit-action.enum';
import { ReferralsService } from '../referrals/referrals.service';
import { TwoFactorService } from '../two-factor/two-factor.service';
import { WalletsService } from '../wallets/wallets.service';
import { UnifiedActivityFeedService } from '../unified-activity-feed/unified-activity-feed.service';
import { GdprService } from '../modules/gdpr/gdpr.service';
import { PasswordResetAttempt } from './entities/password-reset-attempt.entity';
import { OAuthAccount } from './entities/oauth-account.entity';

const USER_ID = 'user-uuid-1';
const OTHER_USER_ID = 'user-uuid-2';
const REFRESH_TOKEN = 'refresh-token-abc';

const mockRefreshTokensService = {
  validateRefreshToken: jest.fn(),
  revokeRefreshToken: jest.fn(),
  revokeAllUserTokens: jest.fn(),
};

const mockAuditLogsService = {
  logAuthEvent: jest.fn(),
};

describe('AuthService.logout()', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: { findByEmail: jest.fn() } },
        { provide: OtpsService, useValue: { validateOtp: jest.fn() } },
        { provide: RefreshTokensService, useValue: mockRefreshTokensService },
        { provide: OtpDeliveryService, useValue: { sendOtp: jest.fn() } },
        {
          provide: JwtService,
          useValue: { sign: jest.fn(), verify: jest.fn() },
        },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: StellarService, useValue: { generateWallet: jest.fn() } },
        { provide: EncryptionService, useValue: { encrypt: jest.fn() } },
        { provide: AuditLogsService, useValue: mockAuditLogsService },
        { provide: ReferralsService, useValue: { createPendingReferral: jest.fn() } },
        { provide: TwoFactorService, useValue: { verifyTotpCode: jest.fn() } },
        {
          provide: WalletsService,
          useValue: { seedPrimaryWalletFromUserCredentials: jest.fn() },
        },
        { provide: I18nService, useValue: { translate: jest.fn((k) => k) } },
        {
          provide: UnifiedActivityFeedService,
          useValue: { recordActivity: jest.fn() },
        },
        { provide: GdprService, useValue: { softDeleteUser: jest.fn() } },
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

  describe('own token', () => {
    beforeEach(() => {
      mockRefreshTokensService.validateRefreshToken.mockResolvedValue({
        id: 'row-1',
        userId: USER_ID,
        revokedAt: null,
      });
      mockRefreshTokensService.revokeRefreshToken.mockResolvedValue(undefined);
      mockAuditLogsService.logAuthEvent.mockResolvedValue(undefined);
    });

    it('revokes the refresh token and returns a 200 message', async () => {
      const result = await service.logout(USER_ID, REFRESH_TOKEN);

      expect(result).toEqual({ message: 'Logged out successfully' });
      expect(
        mockRefreshTokensService.revokeRefreshToken,
      ).toHaveBeenCalledWith(REFRESH_TOKEN);
    });

    it('writes an audit entry without recording the token itself', async () => {
      await service.logout(USER_ID, REFRESH_TOKEN, '10.0.0.1', 'jest');

      expect(mockAuditLogsService.logAuthEvent).toHaveBeenCalledWith(
        USER_ID,
        AuditAction.LOGOUT,
        { ip: '10.0.0.1', device: 'jest' },
      );
      expect(JSON.stringify(mockAuditLogsService.logAuthEvent.mock.calls)).not.toContain(
        REFRESH_TOKEN,
      );
    });
  });

  describe("another user's token", () => {
    beforeEach(() => {
      mockRefreshTokensService.validateRefreshToken.mockResolvedValue({
        id: 'row-2',
        userId: OTHER_USER_ID,
        revokedAt: null,
      });
    });

    it('rejects with 401 and leaves the token untouched', async () => {
      await expect(
        service.logout(USER_ID, REFRESH_TOKEN),
      ).rejects.toThrow(UnauthorizedException);

      expect(
        mockRefreshTokensService.revokeRefreshToken,
      ).not.toHaveBeenCalled();
      expect(mockAuditLogsService.logAuthEvent).not.toHaveBeenCalled();
    });
  });

  describe('unknown, expired or already revoked token', () => {
    it('propagates the 401 raised by validateRefreshToken', async () => {
      mockRefreshTokensService.validateRefreshToken.mockRejectedValue(
        new UnauthorizedException('Invalid or expired refresh token'),
      );

      await expect(
        service.logout(USER_ID, REFRESH_TOKEN),
      ).rejects.toThrow('Invalid or expired refresh token');

      expect(
        mockRefreshTokensService.revokeRefreshToken,
      ).not.toHaveBeenCalled();
    });
  });
});