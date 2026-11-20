import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ThrottlerStorageService } from '@nestjs/throttler';
import { UsersService } from './users.service';
import { User, UserRole, UserPlan, UserKycTier } from './user.entity';
import { RateLimitConfig } from './rate-limit-config.entity';
import { StellarService } from '../blockchain/stellar/stellar.service';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { NotificationPreferenceService } from '../notifications/services/notification-preference.service';
import { RedisService } from '../common/services/redis.service';

describe('UsersService', () => {
  let service: UsersService;
  let userRepository: Repository<User>;
  let stellarService: { getWalletBalances: jest.Mock };

  const mockUser: User = {
    id: 'user-123',
    email: 'test@example.com',
    firstName: 'John',
    lastName: 'Doe',
    phone: '+2348012345678',
    walletPublicKey: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOUJ3UHMNGUAO7UP',
    walletSecretKeyEncrypted: 'encrypted-secret',
    twoFactorSecret: null,
    // Custodial ledger balance and the on-chain snapshot are deliberately
    // different so tests can tell which one a code path reads or writes.
    balances: { XLM: 7, USD: 3 },
    onChainBalances: { NATIVE: 100.5, USDC: 50.25 },
    balanceLastSyncedAt: new Date('2025-03-27T10:30:00Z'),
    referralCode: 'ABC12345',
    referredBy: null,
    isVerified: true,
    kycTier: UserKycTier.ENHANCED,
    isSuspended: false,
    isTwoFactorEnabled: false,
    role: UserRole.USER,
    plan: UserPlan.FREE,
    isDeleted: false,
    isActive: true,
    fcmTokens: [],
    notificationPreferences: {
      email: true,
      push: true,
      types: { TRANSACTION: true, KYC: true, RATE_ALERT: true },
    },
    fcmToken: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-03-27T10:30:00Z'),
    password: process.env.TEST_USER_PASSWORD ?? 'hashed-password',
    notifications: [],
    preferredLanguage: 'en',
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(RateLimitConfig),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: StellarService,
          useValue: {
            getWalletBalances: jest.fn(),
          },
        },
        {
          provide: ExchangeRatesService,
          useValue: {
            getRate: jest.fn(),
          },
        },
        {
          provide: ThrottlerStorageService,
          useValue: {
            getRecord: jest.fn(),
            addRecord: jest.fn(),
            increment: jest.fn(),
          },
        },
        {
          provide: NotificationPreferenceService,
          useValue: {
            createDefaults: jest.fn(),
          },
        },
        { provide: RedisService, useValue: { del: jest.fn() } },
      ],
    }).compile();

    service = (moduleRef as any).get(UsersService) as UsersService;
    userRepository = (moduleRef as any).get(
      getRepositoryToken(User),
    ) as Repository<User>;
    stellarService = (moduleRef as any).get(StellarService);
  });

  describe('getProfile', () => {
    it('should return profile with balances and balanceLastSyncedAt fields', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser);

      const result = await service.getProfile('user-123');

      expect(result).toBeDefined();
      expect(result.id).toBe('user-123');
      expect(result.email).toBe('test@example.com');
      // The profile shows the on-chain snapshot, not the custodial ledger.
      expect(result.balances).toEqual({ NATIVE: 100.5, USDC: 50.25 });
      expect(result.balances).not.toEqual(mockUser.balances);
      expect(result.balanceLastSyncedAt).toEqual(
        new Date('2025-03-27T10:30:00Z'),
      );
      // Ensure sensitive fields are excluded
      expect(result).not.toHaveProperty('password');
      expect(result).not.toHaveProperty('walletSecretKeyEncrypted');
      expect(result).not.toHaveProperty('twoFactorSecret');
    });

    it('does not expose internal or security fields', async () => {
      const userWithSecrets = {
        ...mockUser,
        pendingTwoFactorSecret: 'pending-secret',
        complianceRiskScore: 99,
        failedLoginAttempts: 5,
        lockedUntil: new Date(),
        lastTotpStep: 42,
        twoFactorFailedAttempts: 3,
        twoFactorLockedUntil: new Date(),
        fcmTokens: ['device-token'],
        fcmToken: 'fcm-token',
        stripeCardholderId: 'cus_secret',
        consentGdpr: true,
        consentGdprAt: new Date(),
        consentGdprVersion: '1.0',
        deletedAt: null,
      } as User;
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(userWithSecrets);

      const result = await service.getProfile('user-123');

      const forbiddenKeys = [
        'password',
        'walletSecretKeyEncrypted',
        'twoFactorSecret',
        'pendingTwoFactorSecret',
        'complianceRiskScore',
        'failedLoginAttempts',
        'lockedUntil',
        'lastTotpStep',
        'twoFactorFailedAttempts',
        'twoFactorLockedUntil',
        'fcmTokens',
        'fcmToken',
        'stripeCardholderId',
        'consentGdpr',
        'consentGdprAt',
        'consentGdprVersion',
        'deletedAt',
      ];
      for (const key of forbiddenKeys) {
        expect(result).not.toHaveProperty(key);
      }
      expect(result.id).toBe('user-123');
    });

    it('should return null balanceLastSyncedAt for new users', async () => {
      const newUser = { ...mockUser, balanceLastSyncedAt: null };
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(newUser);

      const result = await service.getProfile('user-123');

      expect(result.balanceLastSyncedAt).toBeNull();
      expect(result.balances).toEqual({ NATIVE: 100.5, USDC: 50.25 });
    });

    it('should return empty balances object when user has no funded wallet', async () => {
      const userWithoutBalances = { ...mockUser, onChainBalances: {} };
      jest
        .spyOn(userRepository, 'findOne')
        .mockResolvedValue(userWithoutBalances);

      const result = await service.getProfile('user-123');

      expect(result.balances).toEqual({});
    });
  });

  describe('syncWalletBalanceSnapshots', () => {
    it('writes the snapshot to onChainBalances and never touches users.balances', async () => {
      jest.spyOn(userRepository, 'find').mockResolvedValue([mockUser]);
      const updateSpy = jest
        .spyOn(userRepository, 'update')
        .mockResolvedValue(undefined as any);
      stellarService.getWalletBalances.mockResolvedValue([
        { asset: 'XLM', balance: '12.5' },
        { asset: 'USDC', assetIssuer: 'GISSUER', balance: '3.25' },
      ]);

      const result = await service.syncWalletBalanceSnapshots();

      expect(result).toEqual({ processed: 1, updated: 1, failed: 0 });
      expect(updateSpy).toHaveBeenCalledTimes(1);
      const [id, patch] = updateSpy.mock.calls[0] as [string, any];
      expect(id).toBe('user-123');
      expect(patch.onChainBalances).toEqual({
        XLM: 12.5,
        'USDC:GISSUER': 3.25,
      });
      expect(patch.balanceLastSyncedAt).toBeInstanceOf(Date);
      // The custodial ledger must not be part of the write at all.
      expect(patch).not.toHaveProperty('balances');
      expect(Object.keys(patch).sort()).toEqual([
        'balanceLastSyncedAt',
        'onChainBalances',
      ]);
    });

    it('does not even load users.balances while syncing', async () => {
      const findSpy = jest
        .spyOn(userRepository, 'find')
        .mockResolvedValue([] as User[]);

      await service.syncWalletBalanceSnapshots();

      expect(findSpy).toHaveBeenCalledWith({
        select: ['id', 'walletPublicKey'],
      });
    });

    it('writes nothing for a user whose wallet lookup fails and counts the failure', async () => {
      jest.spyOn(userRepository, 'find').mockResolvedValue([mockUser]);
      const updateSpy = jest.spyOn(userRepository, 'update');
      stellarService.getWalletBalances.mockRejectedValue(
        new Error('horizon down'),
      );

      const result = await service.syncWalletBalanceSnapshots();

      expect(result).toEqual({ processed: 1, updated: 0, failed: 1 });
      expect(updateSpy).not.toHaveBeenCalled();
    });
  });

  describe('registerDeviceToken', () => {
    it('should add a new token to fcmTokens array', async () => {
      const userWithNoTokens = { ...mockUser, fcmTokens: [] };
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(userWithNoTokens);
      const updateSpy = jest
        .spyOn(userRepository, 'update')
        .mockResolvedValue(undefined as any);

      await service.registerDeviceToken('user-123', 'new-token');

      expect(updateSpy).toHaveBeenCalledWith('user-123', {
        fcmTokens: ['new-token'],
      });
    });

    it('should not add a duplicate token', async () => {
      const userWithToken = { ...mockUser, fcmTokens: ['existing-token'] };
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(userWithToken);
      const updateSpy = jest.spyOn(userRepository, 'update');

      await service.registerDeviceToken('user-123', 'existing-token');

      expect(updateSpy).not.toHaveBeenCalled();
    });
  });

  describe('removeDeviceToken', () => {
    it('should remove a token from fcmTokens array', async () => {
      const userWithTokens = { ...mockUser, fcmTokens: ['token-1', 'token-2'] };
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(userWithTokens);
      const updateSpy = jest
        .spyOn(userRepository, 'update')
        .mockResolvedValue(undefined as any);

      await service.removeDeviceToken('user-123', 'token-1');

      expect(updateSpy).toHaveBeenCalledWith('user-123', {
        fcmTokens: ['token-2'],
      });
    });

    it('should do nothing if token does not exist', async () => {
      const userWithTokens = { ...mockUser, fcmTokens: ['token-2'] };
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(userWithTokens);
      const updateSpy = jest.spyOn(userRepository, 'update');

      await service.removeDeviceToken('user-123', 'token-1');

      expect(updateSpy).not.toHaveBeenCalled();
    });
  });

  describe('createUser without a password', () => {
    const baseParams = {
      email: 'oauth-only@example.com',
      walletPublicKey: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      walletSecretKeyEncrypted: 'encrypted',
      referralCode: 'OAUTH123',
    };

    beforeEach(() => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);
      jest
        .spyOn(userRepository, 'save')
        .mockImplementation(async (entity: any) => entity);
    });

    it('persists a user with a null password and no passwordHash column', async () => {
      const createSpy = jest.spyOn(userRepository, 'create');

      await service.createUser({ ...baseParams });

      const payload = createSpy.mock.calls[0][0] as Record<string, unknown>;
      expect(payload.password).toBeNull();
      expect(payload).not.toHaveProperty('passwordHash');
    });

    it('stores a bcrypt hash in password when one is supplied', async () => {
      const createSpy = jest.spyOn(userRepository, 'create');

      await service.createUser({ ...baseParams, password: 'Secret123!' });

      const payload = createSpy.mock.calls[0][0] as Record<string, unknown>;
      expect(typeof payload.password).toBe('string');
      expect(payload.password).not.toBe('Secret123!');
      expect(payload).not.toHaveProperty('passwordHash');
    });
  });

  describe('two-factor atomic updates', () => {
    const queryBuilder = () => {
      const qb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        returning: jest.fn().mockReturnThis(),
        execute: jest.fn(),
      };
      (userRepository.createQueryBuilder as unknown as jest.Mock).mockReturnValue(
        qb,
      );
      return qb;
    };

    it('increments failures in SQL so parallel guesses cannot share a count', async () => {
      const qb = queryBuilder();
      qb.execute
        .mockResolvedValueOnce({ raw: [{ twoFactorFailedAttempts: 1 }] })
        .mockResolvedValueOnce({ raw: [{ twoFactorFailedAttempts: 2 }] });

      const results = await Promise.all([
        service.incrementTwoFactorFailedAttempts('user-123', 5, 15),
        service.incrementTwoFactorFailedAttempts('user-123', 5, 15),
      ]);

      expect(results).toEqual([1, 2]);
      expect(qb.set).toHaveBeenCalledWith({
        twoFactorFailedAttempts: expect.any(Function),
      });
      expect(qb.returning).toHaveBeenCalledWith('"twoFactorFailedAttempts"');
      expect(userRepository.update).not.toHaveBeenCalled();
    });

    it('locks the user at the threshold using the returned count', async () => {
      const qb = queryBuilder();
      qb.execute.mockResolvedValue({ raw: [{ twoFactorFailedAttempts: 5 }] });

      await expect(
        service.incrementTwoFactorFailedAttempts('user-123', 5, 30),
      ).resolves.toBe(5);
      expect(userRepository.update).toHaveBeenCalledWith('user-123', {
        twoFactorFailedAttempts: 0,
        twoFactorLockedUntil: expect.any(Date),
      });
    });

    it('advances lastTotpStep only when the stored step is older', async () => {
      const qb = queryBuilder();
      qb.execute
        .mockResolvedValueOnce({ affected: 1 })
        .mockResolvedValueOnce({ affected: 0 });

      await expect(service.acceptTotpStep('user-123', 42)).resolves.toBe(true);
      expect(qb.andWhere).toHaveBeenCalledWith(
        '("lastTotpStep" IS NULL OR "lastTotpStep" < :step)',
        { step: 42 },
      );
      await expect(service.acceptTotpStep('user-123', 42)).resolves.toBe(false);
    });
  });
});
