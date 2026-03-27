import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from './users.service';
import { User, UserRole } from './user.entity';
import { StellarService } from '../blockchain/stellar/stellar.service';

describe('UsersService', () => {
  let service: UsersService;
  let userRepository: Repository<User>;

  const mockUser: User = {
    id: 'user-123',
    email: 'test@example.com',
    firstName: 'John',
    lastName: 'Doe',
    phone: '+2348012345678',
    walletPublicKey: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOUJ3UHMNGUAO7UP',
    walletSecretKeyEncrypted: 'encrypted-secret',
    twoFactorSecret: null,
    balances: { NATIVE: 100.5, USDC: 50.25 },
    balanceLastSyncedAt: new Date('2025-03-27T10:30:00Z'),
    referralCode: 'ABC12345',
    referredBy: null,
    isVerified: true,
    isSuspended: false,
    isTwoFactorEnabled: false,
    role: UserRole.USER,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-03-27T10:30:00Z'),
    password: 'hashed-password',
    kycRecords: [],
    notifications: [],
  } as User;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: StellarService,
          useValue: {
            getWalletBalances: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
  });

  describe('getProfile', () => {
    it('should return profile with balances and balanceLastSyncedAt fields', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser);

      const result = await service.getProfile('user-123');

      expect(result).toBeDefined();
      expect(result.id).toBe('user-123');
      expect(result.email).toBe('test@example.com');
      expect(result.balances).toEqual({ NATIVE: 100.5, USDC: 50.25 });
      expect(result.balanceLastSyncedAt).toEqual(
        new Date('2025-03-27T10:30:00Z'),
      );
      // Ensure sensitive fields are excluded
      expect(result).not.toHaveProperty('password');
      expect(result).not.toHaveProperty('walletSecretKeyEncrypted');
      expect(result).not.toHaveProperty('twoFactorSecret');
    });

    it('should return null balanceLastSyncedAt for new users', async () => {
      const newUser = { ...mockUser, balanceLastSyncedAt: null };
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(newUser);

      const result = await service.getProfile('user-123');

      expect(result.balanceLastSyncedAt).toBeNull();
      expect(result.balances).toEqual({ NATIVE: 100.5, USDC: 50.25 });
    });

    it('should return empty balances object when user has no funded wallet', async () => {
      const userWithoutBalances = { ...mockUser, balances: {} };
      jest
        .spyOn(userRepository, 'findOne')
        .mockResolvedValue(userWithoutBalances);

      const result = await service.getProfile('user-123');

      expect(result.balances).toEqual({});
    });
  });

  describe('syncWalletBalanceSnapshots', () => {
    it('should set balanceLastSyncedAt when syncing balances', async () => {
      jest.spyOn(userRepository, 'find').mockResolvedValue([mockUser]);

      const result = await service.syncWalletBalanceSnapshots();

      expect(result).toBeDefined();
      expect(result.processed).toBeGreaterThan(0);
      expect(result.updated).toBeGreaterThan(-1);
      expect(result.failed).toBeGreaterThan(-1);
    });
  });
});
