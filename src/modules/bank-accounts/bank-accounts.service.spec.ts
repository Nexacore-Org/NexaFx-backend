import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { BankAccountsService } from './bank-accounts.service';
import {
  BankProvider,
  LinkedBankAccount,
} from './entities/linked-bank-account.entity';

describe('BankAccountsService', () => {
  let service: BankAccountsService;
  let repo: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    find: jest.Mock;
  };

  const makeAccount = (
    overrides: Partial<LinkedBankAccount> = {},
  ): LinkedBankAccount =>
    ({
      id: 'acc-1',
      userId: 'user-1',
      provider: BankProvider.MONO,
      accountId: 'ext-1',
      bankName: 'Bank',
      accountName: 'Alice',
      accountNumber: '1234',
      currency: 'NGN',
      lastSyncedAt: null,
      isActive: true,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      ...overrides,
    }) as LinkedBankAccount;

  beforeEach(async () => {
    repo = {
      create: jest.fn((dto) => ({ ...dto })),
      save: jest.fn(async (entity) => entity),
      findOne: jest.fn(),
      find: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BankAccountsService,
        { provide: getRepositoryToken(LinkedBankAccount), useValue: repo },
      ],
    }).compile();

    service = module.get(BankAccountsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('initiateLink', () => {
    it('returns a Mono connect URL embedding the generated reference', async () => {
      const result = await service.initiateLink('user-1', BankProvider.MONO);

      expect(result.reference).toMatch(/^nexafx-\d+-[a-z0-9]+$/);
      expect(result.linkUrl).toBe(
        `https://connect.mono.co/connect/auth?reference=${result.reference}`,
      );
    });

    it('returns an Okra connect URL for the OKRA provider', async () => {
      const result = await service.initiateLink('user-1', BankProvider.OKRA);

      expect(result.linkUrl).toBe(
        `https://api.okra.to/v2/connect/initialize?reference=${result.reference}`,
      );
    });

    it('generates a unique reference per call', async () => {
      const a = await service.initiateLink('user-1', BankProvider.MONO);
      const b = await service.initiateLink('user-1', BankProvider.MONO);

      expect(a.reference).not.toBe(b.reference);
    });

    it('does not touch the database', async () => {
      await service.initiateLink('user-1', BankProvider.MONO);

      expect(repo.save).not.toHaveBeenCalled();
      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  describe('handleCallback', () => {
    it('creates and saves an active account using the provider code as accountId', async () => {
      const result = await service.handleCallback('ref-1', 'provider-code');

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: 'provider-code',
          currency: 'NGN',
          isActive: true,
          lastSyncedAt: expect.any(Date),
        }),
      );
      expect(repo.save).toHaveBeenCalledWith(repo.create.mock.results[0].value);
      expect(result.accountId).toBe('provider-code');
    });

    it('stores only the last 4 digits of the account number', async () => {
      const result = await service.handleCallback('ref-1', 'code');

      expect(result.accountNumber.length).toBeLessThanOrEqual(4);
    });

    it('propagates repository save failures', async () => {
      repo.save.mockRejectedValueOnce(new Error('db down'));

      await expect(service.handleCallback('ref-1', 'code')).rejects.toThrow(
        'db down',
      );
    });
  });

  describe('syncBalance', () => {
    it('looks the account up by id and updates lastSyncedAt', async () => {
      const account = makeAccount();
      repo.findOne.mockResolvedValue(account);

      const result = await service.syncBalance('acc-1');

      expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'acc-1' } });
      expect(result.lastSyncedAt).toBeInstanceOf(Date);
      expect(repo.save).toHaveBeenCalledWith(account);
    });

    it('throws NotFoundException when the account does not exist', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.syncBalance('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('getUserAccounts', () => {
    it('returns only active accounts for the user, newest first', async () => {
      const accounts = [makeAccount()];
      repo.find.mockResolvedValue(accounts);

      const result = await service.getUserAccounts('user-1');

      expect(repo.find).toHaveBeenCalledWith({
        where: { userId: 'user-1', isActive: true },
        order: { createdAt: 'DESC' },
      });
      expect(result).toBe(accounts);
    });

    it('returns an empty list when the user has no accounts', async () => {
      repo.find.mockResolvedValue([]);

      await expect(service.getUserAccounts('user-2')).resolves.toEqual([]);
    });
  });

  describe('unlinkAccount', () => {
    it('scopes the lookup to the owning user and soft-deactivates the account', async () => {
      const account = makeAccount();
      repo.findOne.mockResolvedValue(account);

      const result = await service.unlinkAccount('acc-1', 'user-1');

      expect(repo.findOne).toHaveBeenCalledWith({
        where: { id: 'acc-1', userId: 'user-1' },
      });
      expect(result.isActive).toBe(false);
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'acc-1', isActive: false }),
      );
    });

    it("throws NotFoundException when the account belongs to another user", async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.unlinkAccount('acc-1', 'intruder'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.save).not.toHaveBeenCalled();
    });
  });
});
