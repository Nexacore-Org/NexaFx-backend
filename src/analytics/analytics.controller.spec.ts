import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { ExportFormat } from '../entities/report-export-job.entity';
import { SpendingSummary } from '../analytics.service';

describe('AnalyticsController', () => {
  let controller: AnalyticsController;
  let service: AnalyticsService;

  const mockCurrentUser = {
    userId: 'user-1',
    email: 'test@example.com',
    role: 'USER',
  } as CurrentUserPayload;

  const mockAnalyticsService = {
    getSpendingSummary: jest.fn(),
    findUserCategories: jest.fn(),
    createCategory: jest.fn(),
    assignCategory: jest.fn(),
    createExportJob: jest.fn(),
    getUserBalanceSnapshots: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [
        {
          provide: AnalyticsService,
          useValue: mockAnalyticsService,
        },
      ],
    }).compile();

    controller = module.get<AnalyticsController>(AnalyticsController);
    service = module.get<AnalyticsService>(AnalyticsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getSummary', () => {
    it('should return spending summary for the user', async () => {
      const mockSummary: SpendingSummary = {
        categories: [],
        daily: [],
        totalAmount: '100.00000000',
        totalTransactionCount: 0,
      };

      mockAnalyticsService.getSpendingSummary.mockResolvedValue(mockSummary);

      const result = await controller.getSummary(mockCurrentUser, {} as any);

      expect(result).toEqual(mockSummary);
      expect(mockAnalyticsService.getSpendingSummary).toHaveBeenCalledWith('user-1', {});
    });

    it('should pass query parameters to the service', async () => {
      const mockSummary: SpendingSummary = {
        categories: [],
        daily: [],
        totalAmount: '50.00000000',
        totalTransactionCount: 1,
      };

      mockAnalyticsService.getSpendingSummary.mockResolvedValue(mockSummary);

      const query = {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        categoryId: 'cat-1',
      };

      const result = await controller.getSummary(mockCurrentUser, query as any);

      expect(result).toEqual(mockSummary);
      expect(mockAnalyticsService.getSpendingSummary).toHaveBeenCalledWith('user-1', query);
    });
  });

  describe('getCategories', () => {
    it('should return user categories', async () => {
      const categories = [
        { id: 'cat-1', userId: 'user-1', name: 'Food', color: '#EF4444' },
        { id: 'cat-2', userId: 'user-1', name: 'Transport', color: '#3B82F6' },
      ];

      mockAnalyticsService.findUserCategories.mockResolvedValue(categories);

      const result = await controller.getCategories(mockCurrentUser);

      expect(result).toEqual(categories);
      expect(mockAnalyticsService.findUserCategories).toHaveBeenCalledWith('user-1');
    });
  });

  describe('createCategory', () => {
    it('should create a category', async () => {
      const dto = { name: 'Food', color: 'RED' as any };
      const created = { id: 'cat-1', userId: 'user-1', name: 'Food', color: '#EF4444', createdAt: new Date() };

      mockAnalyticsService.createCategory.mockResolvedValue(created);

      const result = await controller.createCategory(mockCurrentUser, dto);

      expect(result).toEqual(created);
      expect(mockAnalyticsService.createCategory).toHaveBeenCalledWith('user-1', dto);
    });
  });

  describe('assignCategory', () => {
    it('should assign category to transaction', async () => {
      const dto = { transactionId: 'tx-1', categoryId: 'cat-1' };
      const assigned = { id: 'tx-1', userId: 'user-1', metadata: { categoryId: 'cat-1' } };

      mockAnalyticsService.assignCategory.mockResolvedValue(assigned);

      const result = await controller.assignCategory(mockCurrentUser, dto);

      expect(result).toEqual(assigned);
      expect(mockAnalyticsService.assignCategory).toHaveBeenCalledWith('user-1', dto);
    });
  });

  describe('createExportJob', () => {
    it('should create an export job with default format', async () => {
      const job = { id: 'job-1', userId: 'user-1', format: ExportFormat.CSV, status: 'PENDING', createdAt: new Date() };

      mockAnalyticsService.createExportJob.mockResolvedValue(job);

      const result = await controller.createExportJob(mockCurrentUser);

      expect(result).toEqual(job);
      expect(mockAnalyticsService.createExportJob).toHaveBeenCalledWith('user-1', ExportFormat.CSV);
    });

    it('should create an export job with specified format', async () => {
      const job = { id: 'job-1', userId: 'user-1', format: ExportFormat.PDF, status: 'PENDING', createdAt: new Date() };

      mockAnalyticsService.createExportJob.mockResolvedValue(job);

      const result = await controller.createExportJob(mockCurrentUser, 'PDF');

      expect(result).toEqual(job);
      expect(mockAnalyticsService.createExportJob).toHaveBeenCalledWith('user-1', ExportFormat.PDF);
    });
  });

  describe('getBalanceSnapshots', () => {
    it('should return balance snapshots', async () => {
      const snapshots = [
        { id: 'snap-1', userId: 'user-1', balance: '1000.00000000', currency: 'USD', snapshotDate: new Date() },
      ];

      mockAnalyticsService.getUserBalanceSnapshots.mockResolvedValue(snapshots);

      const result = await controller.getBalanceSnapshots(mockCurrentUser);

      expect(result).toEqual(snapshots);
      expect(mockAnalyticsService.getUserBalanceSnapshots).toHaveBeenCalledWith('user-1');
    });
  });
});
