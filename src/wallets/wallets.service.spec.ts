import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WalletsService } from './wallets.service';
import { Wallet, StellarNetwork } from './entities/wallet.entity';
import { UsersService } from '../users/users.service';
import { StellarService } from '../modules/stellar/stellar.service';
import { EncryptionService } from '../common/services/encryption.service';

// Manual mock prevents ts-jest from transpiling the real users.service.ts,
// which avoids broken dead-code in its transitive dependency chain.
jest.mock('../users/users.service', () => ({
  UsersService: jest.fn().mockImplementation(() => ({})),
}));

describe('WalletsService', () => {
  let service: WalletsService;
  let walletRepo: Record<string, jest.Mock>;
  let usersService: Record<string, jest.Mock>;
  let stellarService: Record<string, jest.Mock>;
  let encryptionService: Record<string, jest.Mock>;
  let configService: Record<string, jest.Mock>;
  let dataSource: Record<string, jest.Mock>;

  const VALID_PUBLIC_KEY =
    'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOUJ3UHMNGUAO7UP';

  const makeWallet = (overrides: Partial<Wallet> = {}): Wallet =>
    ({
      id: 'wallet-1',
      userId: 'user-1',
      currency: 'XLM',
      balance: '0.00000000',
      publicKey: VALID_PUBLIC_KEY,
      encryptedSecretKey: 'encrypted-secret',
      label: 'Primary',
      isDefault: true,
      network: StellarNetwork.TESTNET,
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-01'),
      ...overrides,
    }) as Wallet;

  beforeEach(async () => {
    walletRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      save: jest
        .fn()
        .mockImplementation((w) => Promise.resolve({ ...w, id: 'saved-id' })),
      create: jest.fn().mockImplementation((w) => w),
      count: jest.fn().mockResolvedValue(0),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    usersService = {
      findById: jest.fn().mockResolvedValue(null),
    };

    stellarService = {
      generateWallet: jest.fn().mockResolvedValue({
        publicKey: 'GNEWKEY1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',
        secretKey: 'SNEWSECRET1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ23',
      }),
      getWalletBalances: jest.fn().mockResolvedValue([]),
    };

    encryptionService = {
      encrypt: jest.fn().mockImplementation((s) => `encrypted(${s})`),
    };

    configService = {
      get: jest.fn().mockReturnValue('TESTNET'),
    };

    // Mock DataSource.transaction to execute the callback with a manager
    const mockManager = {
      getRepository: jest.fn().mockReturnValue({
        findOne: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      }),
    };
    dataSource = {
      transaction: jest
        .fn()
        .mockImplementation(async (cb: (manager: any) => Promise<void>) =>
          cb(mockManager),
        ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletsService,
        { provide: getRepositoryToken(Wallet), useValue: walletRepo },
        { provide: UsersService, useValue: usersService },
        { provide: StellarService, useValue: stellarService },
        { provide: EncryptionService, useValue: encryptionService },
        { provide: ConfigService, useValue: configService },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<WalletsService>(WalletsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAllByUser', () => {
    it('should return all wallets for a user ordered by createdAt ASC', async () => {
      const wallets = [makeWallet({ id: 'w1' }), makeWallet({ id: 'w2' })];
      walletRepo.find.mockResolvedValue(wallets);

      const result = await service.findAllByUser('user-1');

      expect(walletRepo.find).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        order: { createdAt: 'ASC' },
      });
      expect(result).toEqual(wallets);
    });
  });

  describe('findByUserAndCurrency', () => {
    it('should return a wallet matching the currency', async () => {
      const wallet = makeWallet({ currency: 'NGN' });
      walletRepo.findOne.mockResolvedValue(wallet);

      const result = await service.findByUserAndCurrency('user-1', 'ngn');

      expect(walletRepo.findOne).toHaveBeenCalledWith({
        where: { userId: 'user-1', currency: 'NGN' },
      });
      expect(result).toEqual(wallet);
    });

    it('should throw NotFoundException when wallet is not found', async () => {
      walletRepo.findOne.mockResolvedValue(null);

      await expect(
        service.findByUserAndCurrency('user-1', 'BTC'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('seedPrimaryWalletFromUserCredentials', () => {
    it('should create a default primary wallet', async () => {
      walletRepo.count.mockResolvedValue(0);

      await service.seedPrimaryWalletFromUserCredentials(
        'user-1',
        VALID_PUBLIC_KEY,
        'encrypted-key',
      );

      expect(walletRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          publicKey: VALID_PUBLIC_KEY,
          encryptedSecretKey: 'encrypted-key',
          label: 'Primary',
          isDefault: true,
        }),
      );
      expect(walletRepo.save).toHaveBeenCalled();
    });

    it('should skip seeding if user already has wallets (idempotent)', async () => {
      walletRepo.count.mockResolvedValue(1);

      await service.seedPrimaryWalletFromUserCredentials(
        'user-1',
        VALID_PUBLIC_KEY,
        'encrypted-key',
      );

      expect(walletRepo.create).not.toHaveBeenCalled();
    });

    it('should reject an invalid Stellar public key', async () => {
      walletRepo.count.mockResolvedValue(0);

      await expect(
        service.seedPrimaryWalletFromUserCredentials(
          'user-1',
          'INVALID',
          'key',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('resolveWalletForTransaction', () => {
    it('should resolve an explicit wallet by id', async () => {
      const wallet = makeWallet();
      walletRepo.findOne.mockResolvedValue(wallet);

      const result = await service.resolveWalletForTransaction(
        'user-1',
        'wallet-1',
      );

      expect(result.publicKey).toBe(VALID_PUBLIC_KEY);
      expect(result.encryptedSecretKey).toBe('encrypted-secret');
      expect(result.isWatchOnly).toBe(false);
    });

    it('should throw NotFoundException when explicit walletId is not found', async () => {
      walletRepo.findOne.mockResolvedValue(null);

      await expect(
        service.resolveWalletForTransaction('user-1', 'nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should fall back to the default wallet when no walletId provided', async () => {
      const defaultWallet = makeWallet({ isDefault: true });
      walletRepo.findOne.mockResolvedValue(defaultWallet);

      const result = await service.resolveWalletForTransaction('user-1');

      expect(result.publicKey).toBe(VALID_PUBLIC_KEY);
    });

    it('should throw BadRequestException when default wallet is watch-only and allowWatchOnly is false', async () => {
      const watchOnlyWallet = makeWallet({ encryptedSecretKey: null });
      walletRepo.findOne.mockResolvedValue(watchOnlyWallet);

      await expect(
        service.resolveWalletForTransaction('user-1', undefined, {
          allowWatchOnly: false,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow watch-only wallet when allowWatchOnly is true', async () => {
      const watchOnlyWallet = makeWallet({ encryptedSecretKey: null });
      walletRepo.findOne.mockResolvedValue(watchOnlyWallet);

      const result = await service.resolveWalletForTransaction(
        'user-1',
        undefined,
        {
          allowWatchOnly: true,
        },
      );

      expect(result.isWatchOnly).toBe(true);
      expect(result.encryptedSecretKey).toBeNull();
    });

    it('should fall back to legacy User row keys when no wallet exists', async () => {
      // First call: findOne for explicit wallet → null
      // Second call: findOne for default → null
      walletRepo.findOne.mockResolvedValue(null);
      usersService.findById.mockResolvedValue({
        walletPublicKey: 'GLEGACYKEY',
        walletSecretKeyEncrypted: 'legacy-encrypted',
      });

      const result = await service.resolveWalletForTransaction('user-1');

      expect(result.publicKey).toBe('GLEGACYKEY');
      expect(result.isWatchOnly).toBe(false);
    });

    it('should throw BadRequestException when no wallet and no legacy keys', async () => {
      walletRepo.findOne.mockResolvedValue(null);
      usersService.findById.mockResolvedValue({ walletPublicKey: null });

      await expect(
        service.resolveWalletForTransaction('user-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('generateWallet', () => {
    it('should encrypt the secret key and never return it in plaintext', async () => {
      walletRepo.count.mockResolvedValue(0);

      const result = await service.generateWallet('user-1');

      expect(encryptionService.encrypt).toHaveBeenCalledWith(
        'SNEWSECRET1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ23',
      );
      // The summary should not contain the raw secret
      expect(result).not.toHaveProperty('secretKey');
    });

    it('should reject when user already has the maximum wallets (20)', async () => {
      walletRepo.count.mockResolvedValue(20);

      await expect(service.generateWallet('user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should use the provided label if given', async () => {
      walletRepo.count.mockResolvedValue(0);

      await service.generateWallet('user-1', { label: 'My Trading Wallet' });

      expect(walletRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ label: 'My Trading Wallet' }),
      );
    });
  });

  describe('importWatchOnly', () => {
    it('should create a wallet with null encryptedSecretKey (watch-only)', async () => {
      walletRepo.count.mockResolvedValue(0);
      walletRepo.findOne.mockResolvedValue(null);

      const result = await service.importWatchOnly('user-1', {
        publicKey: VALID_PUBLIC_KEY,
      });

      expect(walletRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          encryptedSecretKey: null,
        }),
      );
      expect(result.isWatchOnly).toBe(true);
    });

    it('should reject when the address is already linked to the account', async () => {
      walletRepo.count.mockResolvedValue(0);
      walletRepo.findOne.mockResolvedValue(
        makeWallet({ publicKey: VALID_PUBLIC_KEY }),
      );

      await expect(
        service.importWatchOnly('user-1', { publicKey: VALID_PUBLIC_KEY }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject an invalid Stellar public key', async () => {
      walletRepo.count.mockResolvedValue(0);

      await expect(
        service.importWatchOnly('user-1', { publicKey: 'NOT-A-VALID-KEY' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject when user has reached the wallet limit', async () => {
      walletRepo.count.mockResolvedValue(20);

      await expect(
        service.importWatchOnly('user-1', { publicKey: VALID_PUBLIC_KEY }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('setDefault', () => {
    it('should atomically clear other defaults and set the target as default', async () => {
      const mockManager = {
        getRepository: jest.fn().mockReturnValue({
          findOne: jest
            .fn()
            .mockResolvedValue(
              makeWallet({ id: 'wallet-2', isDefault: false }),
            ),
          update: jest.fn().mockResolvedValue({ affected: 1 }),
        }),
      };
      dataSource.transaction.mockImplementation(
        async (cb: (manager: any) => Promise<void>) => cb(mockManager),
      );

      await service.setDefault('user-1', 'wallet-2');

      // Verify the transaction was used
      expect(dataSource.transaction).toHaveBeenCalled();
      // Verify clear + set pattern
      const walletRepoMock = mockManager.getRepository(Wallet);
      expect(walletRepoMock.update).toHaveBeenCalledWith(
        { userId: 'user-1', isDefault: true },
        { isDefault: false },
      );
      expect(walletRepoMock.update).toHaveBeenCalledWith(
        { id: 'wallet-2' },
        { isDefault: true },
      );
    });

    it('should throw NotFoundException if target wallet is not found', async () => {
      const mockManager = {
        getRepository: jest.fn().mockReturnValue({
          findOne: jest.fn().mockResolvedValue(null),
          update: jest.fn(),
        }),
      };
      dataSource.transaction.mockImplementation(
        async (cb: (manager: any) => Promise<void>) => cb(mockManager),
      );

      await expect(service.setDefault('user-1', 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should do nothing if wallet is already default', async () => {
      const mockManager = {
        getRepository: jest.fn().mockReturnValue({
          findOne: jest
            .fn()
            .mockResolvedValue(makeWallet({ id: 'wallet-1', isDefault: true })),
          update: jest.fn(),
        }),
      };
      dataSource.transaction.mockImplementation(
        async (cb: (manager: any) => Promise<void>) => cb(mockManager),
      );

      await service.setDefault('user-1', 'wallet-1');

      // Should not call update since it's already default
      const walletRepoMock = mockManager.getRepository(Wallet);
      expect(walletRepoMock.update).not.toHaveBeenCalled();
    });
  });

  describe('updateLabel', () => {
    it('should update the label on a wallet the user owns', async () => {
      const wallet = makeWallet();
      walletRepo.findOne.mockResolvedValue(wallet);
      walletRepo.save.mockImplementation((w) => Promise.resolve(w));

      const result = await service.updateLabel(
        'user-1',
        'wallet-1',
        'New Label',
      );

      expect(result.label).toBe('New Label');
    });

    it('should throw NotFoundException if wallet is not found', async () => {
      walletRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updateLabel('user-1', 'nonexistent', 'Label'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject an empty label', async () => {
      const wallet = makeWallet();
      walletRepo.findOne.mockResolvedValue(wallet);
      walletRepo.save.mockImplementation((w) => Promise.resolve(w));

      await expect(
        service.updateLabel('user-1', 'wallet-1', '   '),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('deleteWallet', () => {
    it('should delete a non-default wallet when user has more than one', async () => {
      const nonDefaultWallet = makeWallet({ isDefault: false });
      walletRepo.findOne.mockResolvedValue(nonDefaultWallet);
      walletRepo.count.mockResolvedValue(2);

      await service.deleteWallet('user-1', 'wallet-2');

      expect(walletRepo.delete).toHaveBeenCalledWith({
        id: 'wallet-2',
        userId: 'user-1',
      });
    });

    it('should reject deleting the default wallet', async () => {
      const defaultWallet = makeWallet({ isDefault: true });
      walletRepo.findOne.mockResolvedValue(defaultWallet);

      await expect(service.deleteWallet('user-1', 'wallet-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject deleting the only remaining wallet', async () => {
      const wallet = makeWallet({ isDefault: false });
      walletRepo.findOne.mockResolvedValue(wallet);
      walletRepo.count.mockResolvedValue(1);

      await expect(service.deleteWallet('user-1', 'wallet-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException if wallet is not found', async () => {
      walletRepo.findOne.mockResolvedValue(null);

      await expect(
        service.deleteWallet('user-1', 'nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('watch-only wallet restrictions', () => {
    it('should report isWatchOnly: true when encryptedSecretKey is null', async () => {
      const result = service['toSummary'](
        makeWallet({ encryptedSecretKey: null }),
      );
      expect(result.isWatchOnly).toBe(true);
    });

    it('should report isWatchOnly: false when encryptedSecretKey is present', async () => {
      const result = service['toSummary'](
        makeWallet({ encryptedSecretKey: 'encrypted' }),
      );
      expect(result.isWatchOnly).toBe(false);
    });
  });
});
