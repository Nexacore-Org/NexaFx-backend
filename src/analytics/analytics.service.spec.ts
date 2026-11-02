import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

jest.mock('@nestjs/typeorm', () => {
  const { Inject } = require('@nestjs/common');
  const getRepositoryToken = (entity: any) =>
    `${entity?.name ?? 'Entity'}Repository`;
  return {
    InjectRepository: (entity: any) => Inject(getRepositoryToken(entity)),
    getRepositoryToken,
  };
});

jest.mock('../users/users.service', () => ({
  UsersService: class UsersService {},
}));

jest.mock('../exchange-rates/exchange-rates.service', () => ({
  ExchangeRatesService: class ExchangeRatesService {},
}));

import { getRepositoryToken } from '@nestjs/typeorm';
import { AnalyticsService } from './analytics.service';
import { TransactionCategory } from './entities/transaction-category.entity';
import { BalanceSnapshot } from './entities/balance-snapshot.entity';
import {
  ReportExportJob,
  ExportJobStatus,
  ExportFormat,
} from './entities/report-export-job.entity';
import {
  Transaction,
  TransactionType,
  TransactionStatus,
} from '../transactions/entities/transaction.entity';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;

  const mockTransactionRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const mockCategoryRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((input) => input),
    save: jest.fn(async (entity) => entity),
  };
  const mockBalanceSnapshotRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const mockExportJobRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((input) => input),
    save: jest.fn(async (entity) => entity),
    update: jest.fn(),
  };
  const mockUserRepository = { find: jest.fn(), findOne: jest.fn() };
  const mockUsersService = { getProfile: jest.fn(), findById: jest.fn() };
  const mockExchangeRatesService = { getRate: jest.fn() };
  const mockDataSource = { query: jest.fn() };

  const userId = 'user-1';

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        {
          provide: getRepositoryToken(Transaction),
          useValue: mockTransactionRepository,
        },
        {
          provide: getRepositoryToken(TransactionCategory),
          useValue: mockCategoryRepository,
        },
        {
          provide: getRepositoryToken(BalanceSnapshot),
          useValue: mockBalanceSnapshotRepository,
        },
        {
          provide: getRepositoryToken(ReportExportJob),
          useValue: mockExportJobRepository,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        { provide: UsersService, useValue: mockUsersService },
        { provide: ExchangeRatesService, useValue: mockExchangeRatesService },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  describe('getCategories', () => {
    it('returns system categories plus the caller categories', async () => {
      mockCategoryRepository.find.mockResolvedValue([]);

      await service.getCategories(userId);

      expect(mockCategoryRepository.find).toHaveBeenCalledWith({
        where: [{ isSystem: true }, { userId }],
        order: { isSystem: 'DESC', name: 'ASC' },
      });
    });
  });

  describe('createCategory', () => {
    it('creates a personal category with the supplied icon and colour', async () => {
      await service.createCategory(userId, {
        name: 'Food',
        icon: '🍕',
        color: '#EF4444',
      });

      expect(mockCategoryRepository.create).toHaveBeenCalledWith({
        name: 'Food',
        icon: '🍕',
        color: '#EF4444',
        isSystem: false,
        userId,
      });
      expect(mockCategoryRepository.save).toHaveBeenCalled();
    });

    it('falls back to default icon and colour', async () => {
      await service.createCategory(userId, { name: 'Food' });

      expect(mockCategoryRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ icon: '📦', color: '#6366f1' }),
      );
    });
  });

  describe('assignCategory', () => {
    const transaction = { id: 'tx-1', userId, metadata: { existing: true } };

    it('writes the category id into the transaction metadata', async () => {
      mockTransactionRepository.findOne.mockResolvedValue({ ...transaction });
      mockCategoryRepository.findOne.mockResolvedValue({
        id: 'cat-1',
        isSystem: true,
        userId: null,
      });
      mockTransactionRepository.save.mockImplementation(async (tx) => tx);

      const result = await service.assignCategory('tx-1', userId, 'cat-1');

      expect(result.metadata).toEqual({
        existing: true,
        categoryId: 'cat-1',
      });
      expect(mockTransactionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'tx-1' }),
      );
    });

    it('rejects an unknown transaction', async () => {
      mockTransactionRepository.findOne.mockResolvedValue(null);

      await expect(
        service.assignCategory('tx-missing', userId, 'cat-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects a transaction owned by somebody else', async () => {
      mockTransactionRepository.findOne.mockResolvedValue({
        ...transaction,
        userId: 'someone-else',
      });

      await expect(
        service.assignCategory('tx-1', userId, 'cat-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects an unknown category', async () => {
      mockTransactionRepository.findOne.mockResolvedValue({ ...transaction });
      mockCategoryRepository.findOne.mockResolvedValue(null);

      await expect(
        service.assignCategory('tx-1', userId, 'cat-missing'),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects a personal category owned by somebody else', async () => {
      mockTransactionRepository.findOne.mockResolvedValue({ ...transaction });
      mockCategoryRepository.findOne.mockResolvedValue({
        id: 'cat-2',
        isSystem: false,
        userId: 'someone-else',
      });

      await expect(
        service.assignCategory('tx-1', userId, 'cat-2'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows a system category for any user', async () => {
      mockTransactionRepository.findOne.mockResolvedValue({ ...transaction });
      mockCategoryRepository.findOne.mockResolvedValue({
        id: 'cat-3',
        isSystem: true,
        userId: null,
      });
      mockTransactionRepository.save.mockImplementation(async (tx) => tx);

      await expect(
        service.assignCategory('tx-1', userId, 'cat-3'),
      ).resolves.toBeDefined();
    });
  });

  describe('getMonthlySummary & getTrends (#1521)', () => {
    it('computes 0.1 + 0.2 style sums exactly with Decimal and serializes amounts as strings', async () => {
      mockCategoryRepository.find.mockResolvedValue([]);
      mockTransactionRepository.find.mockResolvedValue([
        {
          id: 'tx-1',
          userId,
          type: TransactionType.WITHDRAW,
          status: TransactionStatus.SUCCESS,
          amount: '0.1',
          currency: 'USD',
          createdAt: new Date(Date.UTC(2026, 5, 10, 12, 0, 0)),
        },
        {
          id: 'tx-2',
          userId,
          type: TransactionType.WITHDRAW,
          status: TransactionStatus.SUCCESS,
          amount: '0.2',
          currency: 'USD',
          createdAt: new Date(Date.UTC(2026, 5, 11, 12, 0, 0)),
        },
      ]);

      const summary = await service.getMonthlySummary(userId, 2026, 6);

      expect(summary.totalSent).toBe('0.3');
      expect(summary.totalReceived).toBe('0');
      expect(summary.netFlow).toBe('-0.3');
      expect(summary.breakdown[0].amount).toBe('0.3');
    });

    it('excludes transactions whose rate lookup fails (e.g. NGN->USD) instead of using rate 1 and reports unconvertedCurrencies', async () => {
      mockCategoryRepository.find.mockResolvedValue([]);
      mockExchangeRatesService.getRate.mockRejectedValue(
        new Error('Rate unavailable for NGN/USD'),
      );
      mockTransactionRepository.find.mockResolvedValue([
        {
          id: 'tx-usd',
          userId,
          type: TransactionType.WITHDRAW,
          status: TransactionStatus.SUCCESS,
          amount: '100',
          currency: 'USD',
          createdAt: new Date(Date.UTC(2026, 5, 5, 10, 0, 0)),
        },
        {
          id: 'tx-ngn',
          userId,
          type: TransactionType.WITHDRAW,
          status: TransactionStatus.SUCCESS,
          amount: '1500000',
          currency: 'NGN',
          createdAt: new Date(Date.UTC(2026, 5, 6, 10, 0, 0)),
        },
      ]);

      const summary = await service.getMonthlySummary(userId, 2026, 6);

      expect(summary.currency).toBe('USD');
      expect(summary.totalSent).toBe('100');
      expect(summary.unconvertedCurrencies).toEqual(['NGN']);
      expect(summary.topTransactions).toHaveLength(1);
      expect(summary.topTransactions[0].id).toBe('tx-usd');
    });

    it('uses UTC month boundaries and produces identical sent/received/net totals between getMonthlySummary and getTrends (counting both WITHDRAW and SWAP as sent)', async () => {
      mockCategoryRepository.find.mockResolvedValue([]);
      const juneTxs = [
        {
          id: 'tx-withdraw',
          userId,
          type: TransactionType.WITHDRAW,
          status: TransactionStatus.SUCCESS,
          amount: '50.25',
          currency: 'USD',
          createdAt: new Date(Date.UTC(2026, 5, 1, 0, 0, 0, 0)),
        },
        {
          id: 'tx-swap',
          userId,
          type: TransactionType.SWAP,
          status: TransactionStatus.SUCCESS,
          amount: '29.75',
          currency: 'USD',
          createdAt: new Date(Date.UTC(2026, 5, 15, 12, 0, 0, 0)),
        },
        {
          id: 'tx-deposit',
          userId,
          type: TransactionType.DEPOSIT,
          status: TransactionStatus.SUCCESS,
          amount: '200.50',
          currency: 'USD',
          createdAt: new Date(Date.UTC(2026, 5, 30, 23, 59, 59, 999)),
        },
      ];
      mockTransactionRepository.find.mockResolvedValue(juneTxs);

      const summary = await service.getMonthlySummary(userId, 2026, 6);
      const trends = await service.getTrends(
        userId,
        1,
        new Date(Date.UTC(2026, 5, 20)),
      );

      expect(summary.totalSent).toBe('80');
      expect(summary.totalReceived).toBe('200.5');
      expect(summary.netFlow).toBe('120.5');

      expect(trends).toHaveLength(1);
      expect(trends[0].month).toBe('2026-06');
      expect(trends[0].sent).toBe(summary.totalSent);
      expect(trends[0].received).toBe(summary.totalReceived);
      expect(trends[0].net).toBe(summary.netFlow);
    });
  });

  describe('createExportJob', () => {
    it('creates a pending CSV job and starts processing', async () => {
      mockExportJobRepository.save.mockImplementation(async (job) => ({
        id: 'job-1',
        ...job,
      }));
      mockExportJobRepository.update.mockResolvedValue({ affected: 1 });

      const job = await service.createExportJob(
        userId,
        'csv',
        '2026-01-01T00:00:00Z',
        '2026-06-30T23:59:59Z',
      );

      expect(mockExportJobRepository.create).toHaveBeenCalledWith({
        userId,
        format: ExportFormat.CSV,
        fromDate: new Date('2026-01-01T00:00:00Z'),
        toDate: new Date('2026-06-30T23:59:59Z'),
        status: ExportJobStatus.PENDING,
      });
      expect(job.id).toBe('job-1');
    });

    it('maps a pdf request onto the PDF format', async () => {
      mockExportJobRepository.save.mockImplementation(async (job) => job);

      await service.createExportJob(
        userId,
        'pdf',
        '2026-01-01T00:00:00Z',
        '2026-06-30T23:59:59Z',
      );

      expect(mockExportJobRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ format: ExportFormat.PDF }),
      );
    });

    it('rejects malformed dates', async () => {
      await expect(
        service.createExportJob(userId, 'csv', 'not-a-date', 'also-not'),
      ).rejects.toThrow(BadRequestException);
      expect(mockExportJobRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('getExportJob', () => {
    it('scopes the lookup to the owner', async () => {
      const job = { id: 'job-1', userId, status: ExportJobStatus.COMPLETED };
      mockExportJobRepository.findOne.mockResolvedValue(job);

      await expect(service.getExportJob('job-1', userId)).resolves.toBe(job);
      expect(mockExportJobRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'job-1', userId },
      });
    });

    it('throws when the job is not visible to the user', async () => {
      mockExportJobRepository.findOne.mockResolvedValue(null);

      await expect(service.getExportJob('job-1', userId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getExportFile', () => {
    const completedJob = {
      id: 'abcdef12-3456-7890-abcd-ef1234567890',
      userId,
      status: ExportJobStatus.COMPLETED,
      format: ExportFormat.CSV,
      filename: 'report-abcdef12.csv',
      fromDate: new Date('2026-01-01T00:00:00Z'),
      toDate: new Date('2026-06-30T23:59:59Z'),
    };

    it('refuses to render a job that has not completed', async () => {
      mockExportJobRepository.findOne.mockResolvedValue({
        ...completedJob,
        status: ExportJobStatus.PENDING,
      });

      await expect(service.getExportFile('abcdef12', userId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('re-renders a completed CSV export', async () => {
      mockExportJobRepository.findOne.mockResolvedValue(completedJob);
      mockTransactionRepository.find.mockResolvedValue([]);
      mockCategoryRepository.find.mockResolvedValue([]);

      const result = await service.getExportFile('abcdef12', userId);

      expect(mockTransactionRepository.find).toHaveBeenCalledWith({
        where: {
          userId,
          createdAt: expect.anything(),
        },
        order: { createdAt: 'ASC' },
      });
      expect(result.contentType).toBe('text/csv');
      expect(result.filename).toBe('report-abcdef12.csv');
      expect(Buffer.isBuffer(result.buffer)).toBe(true);
    });
  });

  describe('getBalanceHistory', () => {
    it('requests the requested number of days for the user', async () => {
      mockBalanceSnapshotRepository.find.mockResolvedValue([]);

      await service.getBalanceHistory(userId, 30);

      const args = mockBalanceSnapshotRepository.find.mock.calls[0][0];
      expect(args.where.userId).toBe(userId);
      expect(args.order).toEqual({ snapshotDate: 'ASC' });
    });
  });

  describe('getLatestSnapshot', () => {
    it('returns the newest snapshot or null', async () => {
      mockBalanceSnapshotRepository.findOne.mockResolvedValue(null);

      await expect(service.getLatestSnapshot(userId)).resolves.toBeNull();
      expect(mockBalanceSnapshotRepository.findOne).toHaveBeenCalledWith({
        where: { userId },
        order: { snapshotDate: 'DESC' },
      });
    });
  });

  describe('autoAssignCategory', () => {
    it('maps transaction types onto system category names', () => {
      expect(service.autoAssignCategory('SWAP' as any)).toBe('Exchange');
      expect(service.autoAssignCategory('WITHDRAW' as any)).toBe('Transfers');
      expect(service.autoAssignCategory('DEPOSIT' as any)).toBe('Transfers');
      expect(
        service.autoAssignCategory('DEPOSIT' as any, { source: 'batch' }),
      ).toBe('Payroll');
      expect(
        service.autoAssignCategory('DEPOSIT' as any, { source: 'savings' }),
      ).toBe('Savings');
      expect(service.autoAssignCategory('UNKNOWN' as any)).toBe('Other');
    });
  });
});
