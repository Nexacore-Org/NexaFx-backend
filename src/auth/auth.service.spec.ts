import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { OtpsService } from '../otps/otps.service';
import { RefreshTokensService } from '../tokens/refresh-tokens.service';
import { OtpDeliveryService } from './email/otp-delivery.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { StellarService } from '../blockchain/stellar/stellar.service';
import { EncryptionService } from '../common/services/encryption.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ReferralsService } from '../referrals/referrals.service';
import { TwoFactorService } from '../two-factor/two-factor.service';
import { WalletsService } from '../wallets/wallets.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PasswordResetAttempt } from './entities/password-reset-attempt.entity';
import { UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { OtpType } from '../otps/otp.entity';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt');

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let otpsService: jest.Mocked<OtpsService>;
  let refreshTokensService: jest.Mocked<RefreshTokensService>;
  let jwtService: jest.Mocked<JwtService>;
  let passwordResetRepository: any;

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    password: 'hashed-password',
    isVerified: true,
    isTwoFactorEnabled: false,
    role: 'USER',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: {
            findByEmail: jest.fn(),
            findById: jest.fn(),
            createUser: jest.fn(),
            updateByUserId: jest.fn(),
          },
        },
        {
          provide: OtpsService,
          useValue: {
            generateOtp: jest.fn(),
            validateOtp: jest.fn(),
          },
        },
        {
          provide: RefreshTokensService,
          useValue: {
            create: jest.fn(),
            validateToken: jest.fn(),
            revoke: jest.fn(),
          },
        },
        {
          provide: OtpDeliveryService,
          useValue: {
            sendOtp: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn(),
            verify: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, any> = {
                JWT_SECRET: 'secret',
                JWT_EXPIRATION: '1h',
              };
              return config[key];
            }),
          },
        },
        {
          provide: StellarService,
          useValue: {
            getWalletBalances: jest.fn(),
          },
        },
        {
          provide: EncryptionService,
          useValue: {
            encrypt: jest.fn(),
            decrypt: jest.fn(),
          },
        },
        {
          provide: AuditLogsService,
          useValue: {
            logAuthEvent: jest.fn(),
          },
        },
        {
          provide: ReferralsService,
          useValue: {},
        },
        {
          provide: TwoFactorService,
          useValue: {
            verifyTotpCode: jest.fn(),
          },
        },
        {
          provide: WalletsService,
          useValue: {},
        },
        {
          provide: getRepositoryToken(PasswordResetAttempt),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(AuthService);
    usersService = module.get(UsersService);
    otpsService = module.get(OtpsService);
    refreshTokensService = module.get(RefreshTokensService);
    jwtService = module.get(JwtService);
    passwordResetRepository = module.get(getRepositoryToken(PasswordResetAttempt));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('should send OTP when credentials are valid', async () => {
      usersService.findByEmail.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      otpsService.generateOtp.mockResolvedValue('123456');

      const result = await service.login({ email: 'test@example.com', password: 'password' });

      expect(result.message).toContain('OTP has been sent');
      expect(otpsService.generateOtp).toHaveBeenCalled();
    });

    it('should return generic message when user not found', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      const result = await service.login({ email: 'test@example.com', password: 'password' });

      expect(result.message).toContain('If an account exists');
    });

    it('should return generic message when password is invalid', async () => {
      usersService.findByEmail.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const result = await service.login({ email: 'test@example.com', password: 'wrong-password' });

      expect(result.message).toContain('If an account exists');
    });

    it('should return generic message when user is not verified', async () => {
      usersService.findByEmail.mockResolvedValue({ ...mockUser, isVerified: false });

      const result = await service.login({ email: 'test@example.com', password: 'password' });

      expect(result.message).toContain('If an account exists');
    });
  });

  describe('verifyLoginOtp', () => {
    it('should issue tokens on valid OTP', async () => {
      const mockTokens = {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 3600,
      };

      usersService.findByEmail.mockResolvedValue(mockUser);
      otpsService.validateOtp.mockResolvedValue(true);
      (service as any).issueAuthTokens = jest.fn().mockResolvedValue(mockTokens);

      const result = await service.verifyLoginOtp({
        email: 'test@example.com',
        otp: '123456',
      });

      expect(result).toHaveProperty('accessToken');
      expect(usersService.updateByUserId).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining({ failedLoginAttempts: 0 }),
      );
    });

    it('should throw UnauthorizedException for invalid OTP', async () => {
      usersService.findByEmail.mockResolvedValue(mockUser);
      otpsService.validateOtp.mockRejectedValue(new UnauthorizedException());

      await expect(
        service.verifyLoginOtp({ email: 'test@example.com', otp: '000000' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when user not found', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.verifyLoginOtp({ email: 'notfound@example.com', otp: '123456' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should return 2FA requirement when 2FA is enabled', async () => {
      usersService.findByEmail.mockResolvedValue({ ...mockUser, isTwoFactorEnabled: true });
      otpsService.validateOtp.mockResolvedValue(true);
      jwtService.sign.mockReturnValue('2fa-token');

      const result = await service.verifyLoginOtp({
        email: 'test@example.com',
        otp: '123456',
      });

      expect(result.requiresTwoFactor).toBe(true);
      expect(result).toHaveProperty('twoFactorToken');
    });
  });

  describe('refresh', () => {
    it('should issue new tokens with valid refresh token', async () => {
      const mockTokens = {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        expiresIn: 3600,
      };

      refreshTokensService.validateToken.mockResolvedValue({
        userId: 'user-123',
        email: 'test@example.com',
        role: 'USER',
      });
      (service as any).issueAuthTokens = jest.fn().mockResolvedValue(mockTokens);

      const result = await service.refresh('valid-refresh-token');

      expect(result).toHaveProperty('accessToken');
    });

    it('should throw UnauthorizedException with expired token', async () => {
      refreshTokensService.validateToken.mockRejectedValue(
        new UnauthorizedException('Token expired'),
      );

      await expect(service.refresh('expired-token')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException with token not in Redis', async () => {
      refreshTokensService.validateToken.mockRejectedValue(
        new UnauthorizedException('Token not found'),
      );

      await expect(service.refresh('revoked-token')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('should revoke refresh token', async () => {
      refreshTokensService.revoke.mockResolvedValue(true);

      const result = await service.logout('user-123');

      expect(refreshTokensService.revoke).toHaveBeenCalledWith('user-123');
      expect(result).toEqual({ message: 'Logged out successfully' });
    });

    it('should handle logout failure gracefully', async () => {
      refreshTokensService.revoke.mockRejectedValue(new Error('Redis error'));

      await expect(service.logout('user-123')).rejects.toThrow();
    });
  });
});
