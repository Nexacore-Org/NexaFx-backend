import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AnalyticsService } from './analytics.service';
import { TransactionCategory } from './entities/transaction-category.entity';
import { BalanceSnapshot } from './entities/balance-snapshot.entity';
import {
  ReportExportJob,
  ExportJobStatus,
  ExportFormat,
} from './entities/report-export-job.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';

// @nestjs/typeorm ships as ESM-only, which the CommonJS jest runtime cannot
// load directly without a mock in unit tests.
jest.mock('@nestjs/typeorm', () => {
  const { Inject } = require('@nestjs/common');
  const tokenFor = (entity: { name?: string } | string) =>
    `${typeof entity === 'string' ? entity : (entity?.name ?? 'Entity')}Repository`;
  return {
    InjectRepository: (entity: { name?: string } | string) =>
      Inject(tokenFor(entity)),
    getRepositoryToken: tokenFor,
  };
});
jest.mock('../exchange-rates/exchange-rates.service', () => ({
  ExchangeRatesService: class ExchangeRatesService {},
}));
jest.mock('../users/users.service', () => ({
  UsersService: class UsersService {},
}));

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
  const mockUsersService = { getProfile: jest.fn() };
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

    it('neutralizes CSV formula injection in category names and counterparty fields (#1523)', async () => {
      mockExportJobRepository.findOne.mockResolvedValue(completedJob);
      mockCategoryRepository.find.mockResolvedValue([
        {
          id: 'cat-evil',
          name: '=HYPERLINK(...)',
          icon: '+icon',
          color: '#000000',
          isSystem: false,
          userId,
        },
      ]);
      mockTransactionRepository.find.mockResolvedValue([
        {
          id: 'tx-1',
          userId,
          type: 'WITHDRAW',
          amount: '50.00',
          currency: 'USD',
          status: 'SUCCESS',
          createdAt: new Date('2026-02-01T00:00:00.000Z'),
          txHash: '@txhash',
          feeAmount: '-0.50',
          metadata: {
            categoryId: 'cat-evil',
            counterparty: "=cmd|' /C calc'!A0",
          },
        },
        {
          id: 'tx-2',
          userId,
          type: 'DEPOSIT',
          amount: '10.00',
          currency: 'USD',
          status: 'SUCCESS',
          createdAt: new Date('2026-02-02T00:00:00.000Z'),
          txHash: '\r=txhash',
          feeAmount: '0',
          metadata: {
            categoryId: 'cat-evil',
            counterparty: '\t=SUM(A1:A2)',
          },
        },
      ]);

      const result = await service.getExportFile('abcdef12', userId);
      const csv = result.buffer.toString('utf-8');

      expect(csv).toContain("'=HYPERLINK(...)");
      expect(csv).toContain("'+icon");
      expect(csv).toContain("'=cmd|' /C calc'!A0");
      expect(csv).toContain("'@txhash");
      expect(csv).toContain("'-0.50");
      expect(csv).toContain("'\t=SUM(A1:A2)");
      expect(csv).toContain("'\r=txhash");
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
