import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { I18nService } from 'nestjs-i18n';
import * as bcrypt from 'bcrypt';
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
import { OAuthCodeService } from './oauth-code.service';
import { PasswordResetAttempt } from './entities/password-reset-attempt.entity';
import { OAuthAccount } from './entities/oauth-account.entity';
import { OtpType } from '../otps/otp.entity';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

describe('AuthService password policy actions', () => {
  let service: AuthService;
  const usersService = {
    findById: jest.fn(),
    updatePassword: jest.fn(),
    updateByUserId: jest.fn(),
  };
  const otpsService = { validateOtp: jest.fn(), invalidateAllUserOtps: jest.fn() };
  const refreshTokensService = { revokeAllUserTokens: jest.fn() };
  const auditLogsService = { logAuthEvent: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: OtpsService, useValue: otpsService },
        { provide: RefreshTokensService, useValue: refreshTokensService },
        { provide: OtpDeliveryService, useValue: { sendOtp: jest.fn() } },
        { provide: JwtService, useValue: { sign: jest.fn(), verify: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('15m') } },
        { provide: StellarService, useValue: {} },
        { provide: EncryptionService, useValue: {} },
        { provide: AuditLogsService, useValue: auditLogsService },
        { provide: ReferralsService, useValue: {} },
        { provide: TwoFactorService, useValue: {} },
        { provide: WalletsService, useValue: {} },
        { provide: I18nService, useValue: { translate: jest.fn((k) => k) } },
        { provide: UnifiedActivityFeedService, useValue: { append: jest.fn() } },
        { provide: GdprService, useValue: {} },
        { provide: OAuthCodeService, useValue: { consume: jest.fn(), issue: jest.fn() } },
        { provide: getRepositoryToken(PasswordResetAttempt), useValue: { count: jest.fn(), save: jest.fn() } },
        { provide: getRepositoryToken(OAuthAccount), useValue: { findOne: jest.fn(), save: jest.fn(), delete: jest.fn(), create: jest.fn() } },
      ],
    }).compile();
    service = module.get(AuthService);
  });

  it('rejects changePassword when new password equals current', async () => {
    usersService.findById.mockResolvedValue({ id: 'u1', password: 'hash' });
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    await expect(
      service.changePassword('u1', { oldPassword: 'OldPass123!!', newPassword: 'SamePass123!!' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('audits and revokes sessions on setPassword with OTP', async () => {
    usersService.findById.mockResolvedValue({ id: 'u1', password: null });
    otpsService.validateOtp.mockResolvedValue(true);
    await service.setPassword('u1', 'NewStrongPass123!', '123456', 'ip', 'ua');
    expect(otpsService.validateOtp).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u1' }),
      '123456',
      OtpType.PASSWORD_RESET,
    );
    expect(refreshTokensService.revokeAllUserTokens).toHaveBeenCalledWith('u1');
    expect(otpsService.invalidateAllUserOtps).toHaveBeenCalledWith('u1');
    expect(auditLogsService.logAuthEvent).toHaveBeenCalledWith(
      'u1',
      AuditAction.PASSWORD_RESET_COMPLETE,
      expect.objectContaining({ reason: expect.stringContaining('set password') }),
    );
  });
});
