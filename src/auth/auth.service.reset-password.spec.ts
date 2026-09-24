/**
 * Unit tests for the POST /auth/reset-password flow.
 *
 * Covers:
 *  - 200 success with valid email + OTP + newPassword
 *  - 401 when the email is not found
 *  - 401 when the user is not verified
 *  - 401 when the OTP is invalid / expired (thrown by OtpsService)
 *  - Side-effects: password update, token revocation, OTP invalidation, audit log
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
import { OtpType } from '../otps/otp.entity';
import { RefreshTokensService } from '../tokens/refresh-tokens.service';
import { OtpDeliveryService } from './email/otp-delivery.service';
import { StellarService } from '../blockchain/stellar/stellar.service';
import { EncryptionService } from '../common/services/encryption.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../audit-logs/enums/audit-action.enum';
import { ReferralsService } from '../referrals/referrals.service';
import { TwoFactorService } from '../two-factor/two-factor.service';
import { WalletsService } from '../wallets/wallets.service';
import { PasswordResetAttempt } from './entities/password-reset-attempt.entity';
import { OAuthAccount } from './entities/oauth-account.entity';
import { ResetPasswordDto } from './dto/reset-password.dto';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeUser = (overrides: Partial<any> = {}) => ({
  id: 'user-uuid-1',
  email: 'trader@nexafx.com',
  password: 'hashed',
  isVerified: true,
  isTwoFactorEnabled: false,
  failedLoginAttempts: 0,
  lockedUntil: null,
  role: 'user',
  ...overrides,
});

const makeResetDto = (
  overrides: Partial<ResetPasswordDto> = {},
): ResetPasswordDto =>
  Object.assign(new ResetPasswordDto(), {
    email: 'trader@nexafx.com',
    otp: '123456',
    newPassword: 'NewStrongPassword!123',
    ...overrides,
  });

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUsersService = {
  findByEmail: jest.fn(),
  updateByUserId: jest.fn(),
  updatePassword: jest.fn(),
};

const mockOtpsService = {
  validateOtp: jest.fn(),
  invalidateAllUserOtps: jest.fn(),
};

const mockRefreshTokensService = {
  revokeAllUserTokens: jest.fn(),
};

const mockAuditLogsService = {
  logAuthEvent: jest.fn(),
};

// Minimal stubs for services not under test
const mockOtpDeliveryService = { sendOtp: jest.fn() };
const mockJwtService = {
  sign: jest.fn().mockReturnValue('token'),
  verify: jest.fn(),
};
const mockConfigService = { get: jest.fn().mockReturnValue('15m') };
const mockStellarService = { generateWallet: jest.fn() };
const mockEncryptionService = { encrypt: jest.fn() };
const mockReferralsService = { createPendingReferral: jest.fn() };
const mockTwoFactorService = { verifyTotpCode: jest.fn() };
const mockWalletsService = { seedPrimaryWalletFromUserCredentials: jest.fn() };
const mockPasswordResetAttemptRepository = {
  count: jest.fn().mockResolvedValue(0),
  save: jest.fn(),
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('AuthService.resetPassword()', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: OtpsService, useValue: mockOtpsService },
        { provide: RefreshTokensService, useValue: mockRefreshTokensService },
        { provide: OtpDeliveryService, useValue: mockOtpDeliveryService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: StellarService, useValue: mockStellarService },
        { provide: EncryptionService, useValue: mockEncryptionService },
        { provide: AuditLogsService, useValue: mockAuditLogsService },
        { provide: ReferralsService, useValue: mockReferralsService },
        { provide: TwoFactorService, useValue: mockTwoFactorService },
        { provide: WalletsService, useValue: mockWalletsService },
        {
          provide: I18nService,
          useValue: {
            translate: jest.fn((key) => key),
          },
        },
        {
          provide: getRepositoryToken(PasswordResetAttempt),
          useValue: mockPasswordResetAttemptRepository,
        },
        {
          provide: getRepositoryToken(OAuthAccount),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  describe('success (200)', () => {
    it('returns a success message when email, OTP, and newPassword are valid', async () => {
      const user = makeUser();
      mockUsersService.findByEmail.mockResolvedValue(user);
      mockOtpsService.validateOtp.mockResolvedValue(true);
      mockUsersService.updateByUserId.mockResolvedValue(undefined);
      mockUsersService.updatePassword.mockResolvedValue(undefined);
      mockRefreshTokensService.revokeAllUserTokens.mockResolvedValue(undefined);
      mockOtpsService.invalidateAllUserOtps.mockResolvedValue(undefined);
      mockAuditLogsService.logAuthEvent.mockResolvedValue(undefined);

      const result = await service.resetPassword(makeResetDto());

      expect(result).toEqual({
        message:
          'Password has been reset successfully. Please login with your new password.',
      });
    });

    it('calls validateOtp with the correct user, OTP, and OTP type', async () => {
      const user = makeUser();
      mockUsersService.findByEmail.mockResolvedValue(user);
      mockOtpsService.validateOtp.mockResolvedValue(true);
      mockUsersService.updateByUserId.mockResolvedValue(undefined);
      mockUsersService.updatePassword.mockResolvedValue(undefined);
      mockRefreshTokensService.revokeAllUserTokens.mockResolvedValue(undefined);
      mockOtpsService.invalidateAllUserOtps.mockResolvedValue(undefined);
      mockAuditLogsService.logAuthEvent.mockResolvedValue(undefined);

      await service.resetPassword(makeResetDto({ otp: '654321' }));

      expect(mockOtpsService.validateOtp).toHaveBeenCalledWith(
        user,
        '654321',
        OtpType.PASSWORD_RESET,
      );
    });

    it('updates the password with the new value', async () => {
      const user = makeUser();
      mockUsersService.findByEmail.mockResolvedValue(user);
      mockOtpsService.validateOtp.mockResolvedValue(true);
      mockUsersService.updateByUserId.mockResolvedValue(undefined);
      mockUsersService.updatePassword.mockResolvedValue(undefined);
      mockRefreshTokensService.revokeAllUserTokens.mockResolvedValue(undefined);
      mockOtpsService.invalidateAllUserOtps.mockResolvedValue(undefined);
      mockAuditLogsService.logAuthEvent.mockResolvedValue(undefined);

      await service.resetPassword(
        makeResetDto({ newPassword: 'AnotherPass!99' }),
      );

      expect(mockUsersService.updatePassword).toHaveBeenCalledWith(
        user.id,
        'AnotherPass!99',
      );
    });

    it('revokes all refresh tokens after a successful reset', async () => {
      const user = makeUser();
      mockUsersService.findByEmail.mockResolvedValue(user);
      mockOtpsService.validateOtp.mockResolvedValue(true);
      mockUsersService.updateByUserId.mockResolvedValue(undefined);
      mockUsersService.updatePassword.mockResolvedValue(undefined);
      mockRefreshTokensService.revokeAllUserTokens.mockResolvedValue(undefined);
      mockOtpsService.invalidateAllUserOtps.mockResolvedValue(undefined);
      mockAuditLogsService.logAuthEvent.mockResolvedValue(undefined);

      await service.resetPassword(makeResetDto());

      expect(mockRefreshTokensService.revokeAllUserTokens).toHaveBeenCalledWith(
        user.id,
      );
    });

    it('invalidates all OTPs for the user after a successful reset', async () => {
      const user = makeUser();
      mockUsersService.findByEmail.mockResolvedValue(user);
      mockOtpsService.validateOtp.mockResolvedValue(true);
      mockUsersService.updateByUserId.mockResolvedValue(undefined);
      mockUsersService.updatePassword.mockResolvedValue(undefined);
      mockRefreshTokensService.revokeAllUserTokens.mockResolvedValue(undefined);
      mockOtpsService.invalidateAllUserOtps.mockResolvedValue(undefined);
      mockAuditLogsService.logAuthEvent.mockResolvedValue(undefined);

      await service.resetPassword(makeResetDto());

      expect(mockOtpsService.invalidateAllUserOtps).toHaveBeenCalledWith(
        user.id,
      );
    });

    it('emits a PASSWORD_RESET_COMPLETE audit event on success', async () => {
      const user = makeUser();
      mockUsersService.findByEmail.mockResolvedValue(user);
      mockOtpsService.validateOtp.mockResolvedValue(true);
      mockUsersService.updateByUserId.mockResolvedValue(undefined);
      mockUsersService.updatePassword.mockResolvedValue(undefined);
      mockRefreshTokensService.revokeAllUserTokens.mockResolvedValue(undefined);
      mockOtpsService.invalidateAllUserOtps.mockResolvedValue(undefined);
      mockAuditLogsService.logAuthEvent.mockResolvedValue(undefined);

      await service.resetPassword(makeResetDto());

      expect(mockAuditLogsService.logAuthEvent).toHaveBeenCalledWith(
        user.id,
        AuditAction.PASSWORD_RESET_COMPLETE,
        expect.objectContaining({ email: user.email }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // 401 — account not found / not verified
  // -------------------------------------------------------------------------

  describe('401 — invalid credentials', () => {
    it('throws UnauthorizedException when no user exists for the given email', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);

      await expect(service.resetPassword(makeResetDto())).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when the user account is not verified', async () => {
      mockUsersService.findByEmail.mockResolvedValue(
        makeUser({ isVerified: false }),
      );

      await expect(service.resetPassword(makeResetDto())).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('does NOT call validateOtp when the user is not found', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);

      await expect(service.resetPassword(makeResetDto())).rejects.toThrow(
        UnauthorizedException,
      );

      expect(mockOtpsService.validateOtp).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 401 — invalid / expired OTP
  // -------------------------------------------------------------------------

  describe('401 — invalid or expired OTP', () => {
    it('propagates UnauthorizedException thrown by OtpsService for an invalid OTP', async () => {
      const user = makeUser();
      mockUsersService.findByEmail.mockResolvedValue(user);
      mockOtpsService.validateOtp.mockRejectedValue(
        new UnauthorizedException('Invalid OTP code'),
      );

      await expect(service.resetPassword(makeResetDto())).rejects.toThrow(
        new UnauthorizedException('Invalid OTP code'),
      );
    });

    it('propagates UnauthorizedException thrown by OtpsService for an expired OTP', async () => {
      const user = makeUser();
      mockUsersService.findByEmail.mockResolvedValue(user);
      mockOtpsService.validateOtp.mockRejectedValue(
        new UnauthorizedException('Invalid or expired OTP'),
      );

      await expect(service.resetPassword(makeResetDto())).rejects.toThrow(
        new UnauthorizedException('Invalid or expired OTP'),
      );
    });

    it('does NOT update the password when the OTP is invalid', async () => {
      const user = makeUser();
      mockUsersService.findByEmail.mockResolvedValue(user);
      mockOtpsService.validateOtp.mockRejectedValue(
        new UnauthorizedException('Invalid OTP code'),
      );

      await expect(service.resetPassword(makeResetDto())).rejects.toThrow(
        UnauthorizedException,
      );

      expect(mockUsersService.updatePassword).not.toHaveBeenCalled();
    });

    it('does NOT revoke tokens when the OTP is invalid', async () => {
      const user = makeUser();
      mockUsersService.findByEmail.mockResolvedValue(user);
      mockOtpsService.validateOtp.mockRejectedValue(
        new UnauthorizedException('Invalid OTP code'),
      );

      await expect(service.resetPassword(makeResetDto())).rejects.toThrow(
        UnauthorizedException,
      );

      expect(
        mockRefreshTokensService.revokeAllUserTokens,
      ).not.toHaveBeenCalled();
    });
  });
});
