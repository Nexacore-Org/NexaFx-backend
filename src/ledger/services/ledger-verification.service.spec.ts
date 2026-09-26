import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import {
  LedgerVerificationService,
  LedgerVerificationResult,
} from './ledger-verification.service';
import { LedgerEntry } from '../entities/ledger-entry.entity';
import { User, UserRole } from '../../users/user.entity';
import { NotificationsService } from '../../notifications/notifications.service';

const mockLedgerRepo = () => ({
  query: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  save: jest.fn(),
});

const mockUserRepo = () => ({
  find: jest.fn(),
});

const mockNotificationsService = () => ({
  dispatch: jest.fn().mockResolvedValue(undefined),
});

describe('LedgerVerificationService', () => {
  let service: LedgerVerificationService;
  let ledgerRepo: ReturnType<typeof mockLedgerRepo>;
  let userRepo: ReturnType<typeof mockUserRepo>;
  let notificationsService: ReturnType<typeof mockNotificationsService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LedgerVerificationService,
        {
          provide: getRepositoryToken(LedgerEntry),
          useFactory: mockLedgerRepo,
        },
        {
          provide: getRepositoryToken(User),
          useFactory: mockUserRepo,
        },
        {
          provide: NotificationsService,
          useFactory: mockNotificationsService,
        },
      ],
    }).compile();

    service = module.get<LedgerVerificationService>(LedgerVerificationService);
    ledgerRepo = module.get(getRepositoryToken(LedgerEntry));
    userRepo = module.get(getRepositoryToken(User));
    notificationsService = module.get(NotificationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── verify() ──────────────────────────────────────────────────────────────
  describe('verify()', () => {
    it('returns BALANCED when no discrepancies exist', async () => {
      ledgerRepo.query.mockResolvedValue([]);

      const result = await service.verify();

      expect(result.status).toBe('BALANCED');
      expect(result.discrepancies).toHaveLength(0);
      expect(notificationsService.dispatch).not.toHaveBeenCalled();
    });

    it('returns DISCREPANCY and notifies admins when discrepancies exist', async () => {
      const rows = [{ currency: 'USD', amountDelta: '-50.00' }];
      ledgerRepo.query.mockResolvedValue(rows);

      const adminUser = {
        id: 'admin-1',
        role: UserRole.ADMIN,
      } as User;
      userRepo.find.mockResolvedValue([adminUser]);

      const result: LedgerVerificationResult = await service.verify();

      expect(result.status).toBe('DISCREPANCY');
      expect(result.discrepancies).toHaveLength(1);
      expect(result.discrepancies[0].currency).toBe('USD');
      expect(result.discrepancies[0].amountDelta).toBe('-50.00');

      expect(notificationsService.dispatch).toHaveBeenCalledTimes(1);
      expect(notificationsService.dispatch).toHaveBeenCalledWith(
        'admin-1',
        expect.any(String),
        expect.stringContaining('discrepancy'),
        expect.any(String),
        expect.any(Object),
      );
    });

    it('logs a warning and does not dispatch when no admins found', async () => {
      ledgerRepo.query.mockResolvedValue([
        { currency: 'NGN', amountDelta: '100' },
      ]);
      userRepo.find.mockResolvedValue([]);

      const loggerWarnSpy = jest
        .spyOn((service as any).logger, 'warn')
        .mockImplementation(() => {});

      const result = await service.verify();

      expect(result.status).toBe('DISCREPANCY');
      expect(notificationsService.dispatch).not.toHaveBeenCalled();
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('no admins'),
      );
    });

    it('notifies multiple admins when multiple discrepancies exist', async () => {
      const rows = [
        { currency: 'USD', amountDelta: '-50.00' },
        { currency: 'EUR', amountDelta: '10.00' },
      ];
      ledgerRepo.query.mockResolvedValue(rows);

      const admins = [
        { id: 'admin-1', role: UserRole.ADMIN } as User,
        { id: 'admin-2', role: UserRole.SUPER_ADMIN } as User,
      ];
      userRepo.find.mockResolvedValue(admins);

      const result = await service.verify();

      expect(result.discrepancies).toHaveLength(2);
      expect(notificationsService.dispatch).toHaveBeenCalledTimes(2);
    });
  });

  // ─── getEntries() ──────────────────────────────────────────────────────────
  describe('getEntries()', () => {
    it('throws BadRequestException when transactionId is not provided', async () => {
      await expect(service.getEntries(undefined)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('returns entries ordered by createdAt ASC for a given transactionId', async () => {
      const entries = [
        {
          id: 'entry-1',
          transactionId: 'tx-1',
          createdAt: new Date('2024-01-01'),
        },
        {
          id: 'entry-2',
          transactionId: 'tx-1',
          createdAt: new Date('2024-01-02'),
        },
      ];
      ledgerRepo.find.mockResolvedValue(entries);

      const result = await service.getEntries('tx-1');

      expect(ledgerRepo.find).toHaveBeenCalledWith({
        where: { transactionId: 'tx-1' },
        order: { createdAt: 'ASC' },
      });
      expect(result).toHaveLength(2);
    });

    it('returns empty array when no entries found for transactionId', async () => {
      ledgerRepo.find.mockResolvedValue([]);

      const result = await service.getEntries('tx-nonexistent');
      expect(result).toHaveLength(0);
    });
  });

  // ─── getBalances() ─────────────────────────────────────────────────────────
  describe('getBalances()', () => {
    it('returns balance rows from raw query', async () => {
      const rows = [
        { currency: 'USD', accountType: 'USER', balance: '500.00' },
        { currency: 'USD', accountType: 'PLATFORM_ASSET', balance: '-500.00' },
      ];
      ledgerRepo.query.mockResolvedValue(rows);

      const result = await service.getBalances();

      expect(ledgerRepo.query).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(2);
      expect(result[0].currency).toBe('USD');
      expect(result[0].balance).toBe('500.00');
    });

    it('returns empty array when no balance rows', async () => {
      ledgerRepo.query.mockResolvedValue([]);
      const result = await service.getBalances();
      expect(result).toHaveLength(0);
    });
  });
});
