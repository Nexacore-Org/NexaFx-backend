import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AnalyticsService } from './analytics.service';
import { TransactionCategory } from './entities/transaction-category.entity';
import { BalanceSnapshot } from './entities/balance-snapshot.entity';
import { ReportExportJob, ExportJobStatus, ExportFormat } from './entities/report-export-job.entity';
import { Transaction, TransactionType } from '../../transactions/entities/transaction.entity';
import Decimal from 'decimal.js';

describe('AnalyticsService', () => {
  let service: AnalyticsService;

  const mockTransactionRepository = {
    createQueryBuilder: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const mockCategoryRepository = {
    createQueryBuilder: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockBalanceSnapshotRepository = {
    createQueryBuilder: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockExportJobRepository = {
    createQueryBuilder: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockDataSource = {
    createQueryBuilder: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
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
          provide: getRepositoryToken(Transaction),
          useValue: mockTransactionRepository,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getSpendingSummary', () => {
    it('should aggregate spending by category and date range', async () => {
      const userId = 'user-1';
      const query = { startDate: '2024-01-01', endDate: '2024-01-31' };

      const categoryQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { categoryId: 'cat-1', categoryName: 'Food', color: '#EF4444', totalAmount: '150.00000000', transactionCount: 3 },
          { categoryId: 'cat-2', categoryName: 'Transport', color: '#3B82F6', totalAmount: '50.00000000', transactionCount: 1 },
        ]),
      };

      const dailyQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { date: '2024-01-15', totalAmount: '100.00000000', transactionCount: 2 },
          { date: '2024-01-20', totalAmount: '100.00000000', transactionCount: 2 },
        ]),
      };

      mockDataSource.createQueryBuilder
        .mockReturnValueOnce(categoryQueryBuilder as any)
        .mockReturnValueOnce(dailyQueryBuilder as any);

      const result = await service.getSpendingSummary(userId, query);

      expect(result.categories).toHaveLength(2);
      expect(result.categories[0].categoryName).toBe('Food');
      expect(result.categories[0].totalAmount).toBe('150.00000000');
      expect(result.daily).toHaveLength(2);
      expect(result.totalAmount).toBe('200.00000000');
      expect(result.totalTransactionCount).toBe(4);
    });

    it('should scope results to the requesting user and exclude other users transactions', async () => {
      const userId = 'user-1';
      const otherUserId = 'user-2';
      const query = { startDate: '2024-01-01', endDate: '2024-01-31' };

      const categoryQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { categoryId: 'cat-1', categoryName: 'Food', color: '#EF4444', totalAmount: '150.00000000', transactionCount: 3 },
        ]),
      };

      const dailyQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { date: '2024-01-15', totalAmount: '150.00000000', transactionCount: 3 },
        ]),
      };

      mockDataSource.createQueryBuilder
        .mockReturnValueOnce(categoryQueryBuilder as any)
        .mockReturnValueOnce(dailyQueryBuilder as any);

      const result = await service.getSpendingSummary(userId, query);

      const categoryWhereCall = categoryQueryBuilder.where.mock.calls.find((call) => call[0].includes('userId'));
      const dailyWhereCall = dailyQueryBuilder.where.mock.calls.find((call) => call[0].includes('userId'));
      expect(categoryWhereCall[1]).toEqual({ userId, startDate: new Date('2024-01-01'), endDate: new Date('2024-01-31'), status: 'SUCCESS' });
      expect(dailyWhereCall[1]).toEqual({ userId, startDate: new Date('2024-01-01'), endDate: new Date('2024-01-31'), status: 'SUCCESS' });
      expect(result.totalAmount).toBe('150.00000000');
    });

    it('should use default date range when dates are not provided', async () => {
      const userId = 'user-1';
      const query = {};

      const categoryQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };

      const dailyQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };

      mockDataSource.createQueryBuilder
        .mockReturnValueOnce(categoryQueryBuilder as any)
        .mockReturnValueOnce(dailyQueryBuilder as any);

      await service.getSpendingSummary(userId, query);

      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const categoryWhereCall = categoryQueryBuilder.where.mock.calls.find((call) => call[0].includes('userId'));
      expect(categoryWhereCall[1].startDate).toBeInstanceOf(Date);
      expect(categoryWhereCall[1].endDate).toBeInstanceOf(Date);
      expect(categoryWhereCall[1].startDate.getTime()).toBeLessThanOrEqual(thirtyDaysAgo.getTime() + 1000);
    });

    it('should handle uncategorised transactions', async () => {
      const userId = 'user-1';
      const query = { startDate: '2024-01-01', endDate: '2024-01-31' };

      const categoryQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { categoryId: '', categoryName: 'Uncategorised', color: null, totalAmount: '200.00000000', transactionCount: 5 },
        ]),
      };

      const dailyQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };

      mockDataSource.createQueryBuilder
        .mockReturnValueOnce(categoryQueryBuilder as any)
        .mockReturnValueOnce(dailyQueryBuilder as any);

      const result = await service.getSpendingSummary(userId, query);

      expect(result.categories).toHaveLength(1);
      expect(result.categories[0].categoryName).toBe('Uncategorised');
      expect(result.categories[0].color).toBeNull();
      expect(result.totalAmount).toBe('200.00000000');
    });
  });

  describe('createCategory', () => {
    it('should create a category successfully', async () => {
      const userId = 'user-1';
      const dto = { name: 'Groceries', color: 'GREEN' as any };

      mockCategoryRepository.findOne.mockResolvedValue(null);
      mockCategoryRepository.create.mockReturnValue({ id: 'cat-1', userId, name: 'Groceries', color: '#22C55E' } as any);
      mockCategoryRepository.save.mockResolvedValue({ id: 'cat-1', userId, name: 'Groceries', color: '#22C55E', createdAt: new Date() } as any);

      const result = await service.createCategory(userId, dto);

      expect(result.name).toBe('Groceries');
      expect(result.userId).toBe(userId);
      expect(mockCategoryRepository.create).toHaveBeenCalledWith({
        userId,
        name: 'Groceries',
        color: '#22C55E',
      });
    });

    it('should use default color when color is not provided', async () => {
      const userId = 'user-1';
      const dto = { name: 'Groceries' };

      mockCategoryRepository.findOne.mockResolvedValue(null);
      mockCategoryRepository.create.mockReturnValue({ id: 'cat-1', userId, name: 'Groceries', color: '#6B7280' } as any);
      mockCategoryRepository.save.mockResolvedValue({ id: 'cat-1', userId, name: 'Groceries', color: '#6B7280', createdAt: new Date() } as any);

      const result = await service.createCategory(userId, dto);

      expect(result.color).toBe('#6B7280');
      expect(mockCategoryRepository.create).toHaveBeenCalledWith({
        userId,
        name: 'Groceries',
        color: '#6B7280',
      });
    });

    it('should reject a category name collision', async () => {
      const userId = 'user-1';
      const dto = { name: 'Groceries' };

      mockCategoryRepository.findOne.mockResolvedValue({ id: 'cat-1', userId, name: 'Groceries' } as any);

      await expect(service.createCategory(userId, dto)).rejects.toThrow(ConflictException);
      await expect(service.createCategory(userId, dto)).rejects.toThrow("Category with name 'Groceries' already exists");
      expect(mockCategoryRepository.create).not.toHaveBeenCalled();
      expect(mockCategoryRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('findUserCategories', () => {
    it('should return all categories for a user', async () => {
      const userId = 'user-1';
      const categories = [
        { id: 'cat-1', userId, name: 'Food', color: '#EF4444' },
        { id: 'cat-2', userId, name: 'Transport', color: '#3B82F6' },
      ];

      mockCategoryRepository.find.mockResolvedValue(categories);

      const result = await service.findUserCategories(userId);

      expect(result).toEqual(categories);
      expect(mockCategoryRepository.find).toHaveBeenCalledWith({
        where: { userId },
        order: { createdAt: 'ASC' },
      });
    });
  });

  describe('assignCategory', () => {
    it('should assign category to transaction successfully', async () => {
      const userId = 'user-1';
      const dto = { transactionId: 'tx-1', categoryId: 'cat-1' };

      mockTransactionRepository.findOne.mockResolvedValue({ id: 'tx-1', userId, metadata: {} } as any);
      mockCategoryRepository.findOne.mockResolvedValue({ id: 'cat-1', userId } as any);
      mockTransactionRepository.save.mockResolvedValue({ id: 'tx-1', userId, metadata: { categoryId: 'cat-1' } as any);

      const result = await service.assignCategory(userId, dto);

      expect(result.metadata.categoryId).toBe('cat-1');
      expect(mockTransactionRepository.save).toHaveBeenCalledWith(expect.objectContaining({
        id: 'tx-1',
        metadata: { categoryId: 'cat-1' },
      }));
    });

    it('should reject assignment to a nonexistent transaction', async () => {
      const userId = 'user-1';
      const dto = { transactionId: 'nonexistent-tx', categoryId: 'cat-1' };

      mockTransactionRepository.findOne.mockResolvedValue(null);

      await expect(service.assignCategory(userId, dto)).rejects.toThrow(NotFoundException);
      await expect(service.assignCategory(userId, dto)).rejects.toThrow('Transaction nonexistent-tx not found');
      expect(mockCategoryRepository.findOne).not.toHaveBeenCalled();
    });

    it('should reject assignment when transaction belongs to another user', async () => {
      const userId = 'user-1';
      const dto = { transactionId: 'tx-1', categoryId: 'cat-1' };

      mockTransactionRepository.findOne.mockResolvedValue({ id: 'tx-1', userId: 'user-2' } as any);

      await expect(service.assignCategory(userId, dto)).rejects.toThrow(BadRequestException);
      await expect(service.assignCategory(userId, dto)).rejects.toThrow('Transaction does not belong to the current user');
    });

    it('should reject assignment to a nonexistent category', async () => {
      const userId = 'user-1';
      const dto = { transactionId: 'tx-1', categoryId: 'nonexistent-cat' };

      mockTransactionRepository.findOne.mockResolvedValue({ id: 'tx-1', userId } as any);
      mockCategoryRepository.findOne.mockResolvedValue(null);

      await expect(service.assignCategory(userId, dto)).rejects.toThrow(NotFoundException);
      await expect(service.assignCategory(userId, dto)).rejects.toThrow('Category nonexistent-cat not found');
    });

    it('should reject assignment when category belongs to another user', async () => {
      const userId = 'user-1';
      const dto = { transactionId: 'tx-1', categoryId: 'cat-1' };

      mockTransactionRepository.findOne.mockResolvedValue({ id: 'tx-1', userId } as any);
      mockCategoryRepository.findOne.mockResolvedValue({ id: 'cat-1', userId: 'user-2' } as any);

      await expect(service.assignCategory(userId, dto)).rejects.toThrow(BadRequestException);
      await expect(service.assignCategory(userId, dto)).rejects.toThrow('Category does not belong to the current user');
    });
  });

  describe('createExportJob', () => {
    it('should create an export job with default format', async () => {
      const userId = 'user-1';

      mockExportJobRepository.create.mockReturnValue({ userId, format: ExportFormat.CSV, status: ExportJobStatus.PENDING } as any);
      mockExportJobRepository.save.mockResolvedValue({ id: 'job-1', userId, format: ExportFormat.CSV, status: ExportJobStatus.PENDING, createdAt: new Date() } as any);

      const result = await service.createExportJob(userId, ExportFormat.CSV);

      expect(result.format).toBe(ExportFormat.CSV);
      expect(result.status).toBe(ExportJobStatus.PENDING);
    });

    it('should create an export job with specified format', async () => {
      const userId = 'user-1';

      mockExportJobRepository.create.mockReturnValue({ userId, format: ExportFormat.PDF, status: ExportJobStatus.PENDING } as any);
      mockExportJobRepository.save.mockResolvedValue({ id: 'job-1', userId, format: ExportFormat.PDF, status: ExportJobStatus.PENDING, createdAt: new Date() } as any);

      const result = await service.createExportJob(userId, ExportFormat.PDF);

      expect(result.format).toBe(ExportFormat.PDF);
    });
  });

  describe('getUserBalanceSnapshots', () => {
    it('should return up to 90 snapshots ordered by date desc', async () => {
      const userId = 'user-1';
      const snapshots = [
        { id: 'snap-1', userId, balance: '1000.00000000', currency: 'USD', snapshotDate: new Date('2024-01-31') },
        { id: 'snap-2', userId, balance: '950.00000000', currency: 'USD', snapshotDate: new Date('2024-01-30') },
      ];

      mockBalanceSnapshotRepository.find.mockResolvedValue(snapshots);

      const result = await service.getUserBalanceSnapshots(userId);

      expect(result).toEqual(snapshots);
      expect(mockBalanceSnapshotRepository.find).toHaveBeenCalledWith({
        where: { userId },
        order: { snapshotDate: 'DESC' },
        take: 90,
      });
    });
  });

  describe('recordBalanceSnapshot', () => {
    it('should record a balance snapshot', async () => {
      const userId = 'user-1';
      const snapshot = { id: 'snap-1', userId, balance: '1000.00000000', currency: 'USD', snapshotDate: new Date() };

      mockBalanceSnapshotRepository.create.mockReturnValue(snapshot as any);
      mockBalanceSnapshotRepository.save.mockResolvedValue({ ...snapshot, createdAt: new Date() } as any);

      const result = await service.recordBalanceSnapshot(userId, '1000.00000000', 'USD');

      expect(mockBalanceSnapshotRepository.create).toHaveBeenCalledWith({
        userId,
        balance: '1000.00000000',
        currency: 'USD',
        snapshotDate: expect.any(Date),
      });
      expect(result.balance).toBe('1000.00000000');
    });
  });
});
