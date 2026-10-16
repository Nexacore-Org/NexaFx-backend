import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AnalyticsController, TransactionCategoryController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { ExportFormat } from './entities/report-export-job.entity';

describe('AnalyticsController', () => {
  let controller: AnalyticsController;
  let categoryController: TransactionCategoryController;

  const mockCurrentUser = {
    userId: 'user-1',
    email: 'test@example.com',
    role: 'USER',
  } as CurrentUserPayload;

  const mockAnalyticsService = {
    createCategory: jest.fn(),
    getCategories: jest.fn(),
    getMonthlySummary: jest.fn(),
    getTrends: jest.fn(),
    getBalanceHistory: jest.fn(),
    createExportJob: jest.fn(),
    getExportJob: jest.fn(),
    getExportFile: jest.fn(),
    assignCategory: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController, TransactionCategoryController],
      providers: [
        {
          provide: AnalyticsService,
          useValue: mockAnalyticsService,
        },
      ],
    }).compile();

    controller = module.get<AnalyticsController>(AnalyticsController);
    categoryController =
      module.get<TransactionCategoryController>(TransactionCategoryController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
    expect(categoryController).toBeDefined();
  });

  describe('getSummary', () => {
    it('defaults to the current year and month', async () => {
      const summary = {
        totalSent: 0,
        totalReceived: 0,
        netFlow: 0,
        currency: 'USD',
        breakdown: [],
        topTransactions: [],
      };
      mockAnalyticsService.getMonthlySummary.mockResolvedValue(summary);

      const now = new Date();
      const result = await controller.getSummary(
        { user: mockCurrentUser } as any,
        {},
      );

      expect(result).toEqual(summary);
      expect(mockAnalyticsService.getMonthlySummary).toHaveBeenCalledWith(
        'user-1',
        now.getFullYear(),
        now.getMonth() + 1,
      );
    });

    it('passes the requested year and month through', async () => {
      const summary = {
        totalSent: 10,
        totalReceived: 25,
        netFlow: 15,
        currency: 'USD',
        breakdown: [],
        topTransactions: [],
      };
      mockAnalyticsService.getMonthlySummary.mockResolvedValue(summary);

      const result = await controller.getSummary(
        { user: mockCurrentUser } as any,
        { year: 2026, month: 6 },
      );

      expect(result).toEqual(summary);
      expect(mockAnalyticsService.getMonthlySummary).toHaveBeenCalledWith(
        'user-1',
        2026,
        6,
      );
    });
  });

  describe('getCategories', () => {
    it('returns the system and personal categories for the user', async () => {
      const categories = [
        { id: 'cat-1', userId: null, name: 'Transfers', isSystem: true },
        { id: 'cat-2', userId: 'user-1', name: 'Food', isSystem: false },
      ];
      mockAnalyticsService.getCategories.mockResolvedValue(categories);

      const result = await controller.getCategories({
        user: mockCurrentUser,
      } as any);

      expect(result).toEqual(categories);
      expect(mockAnalyticsService.getCategories).toHaveBeenCalledWith('user-1');
    });
  });

  describe('createCategory', () => {
    it('creates a personal category for the current user', async () => {
      const dto = { name: 'Food', icon: '🍕', color: '#EF4444' };
      const created = {
        id: 'cat-1',
        userId: 'user-1',
        name: 'Food',
        isSystem: false,
      };
      mockAnalyticsService.createCategory.mockResolvedValue(created);

      const result = await controller.createCategory(
        { user: mockCurrentUser } as any,
        dto,
      );

      expect(result).toEqual(created);
      expect(mockAnalyticsService.createCategory).toHaveBeenCalledWith(
        'user-1',
        dto,
      );
    });
  });

  describe('getTrends', () => {
    it('defaults to six months', async () => {
      const trends = [{ month: '2026-05', sent: 1, received: 2, net: 1 }];
      mockAnalyticsService.getTrends.mockResolvedValue(trends);

      const result = await controller.getTrends(
        { user: mockCurrentUser } as any,
        {},
      );

      expect(result).toEqual(trends);
      expect(mockAnalyticsService.getTrends).toHaveBeenCalledWith('user-1', 6);
    });

    it('honours the requested window', async () => {
      mockAnalyticsService.getTrends.mockResolvedValue([]);

      await controller.getTrends({ user: mockCurrentUser } as any, {
        months: 12,
      });

      expect(mockAnalyticsService.getTrends).toHaveBeenCalledWith('user-1', 12);
    });
  });

  describe('getBalanceHistory', () => {
    it('defaults to thirty days', async () => {
      const history = [{ date: '2026-01-01', balances: { XLM: 10 } }];
      mockAnalyticsService.getBalanceHistory.mockResolvedValue(history);

      const result = await controller.getBalanceHistory(
        { user: mockCurrentUser } as any,
        {},
      );

      expect(result).toEqual(history);
      expect(mockAnalyticsService.getBalanceHistory).toHaveBeenCalledWith(
        'user-1',
        30,
      );
    });

    it('honours the requested window', async () => {
      mockAnalyticsService.getBalanceHistory.mockResolvedValue([]);

      await controller.getBalanceHistory({ user: mockCurrentUser } as any, {
        days: 90,
      });

      expect(mockAnalyticsService.getBalanceHistory).toHaveBeenCalledWith(
        'user-1',
        90,
      );
    });
  });

  describe('createExport', () => {
    it('creates a CSV export job for the requested window', async () => {
      const job = {
        id: 'job-1',
        userId: 'user-1',
        format: ExportFormat.CSV,
        status: 'PENDING',
      };
      mockAnalyticsService.createExportJob.mockResolvedValue(job);

      const query = {
        format: 'csv',
        from: '2026-01-01T00:00:00Z',
        to: '2026-06-30T23:59:59Z',
      } as const;
      const result = await controller.createExport(
        { user: mockCurrentUser } as any,
        query,
      );

      expect(result).toEqual(job);
      expect(mockAnalyticsService.createExportJob).toHaveBeenCalledWith(
        'user-1',
        'csv',
        query.from,
        query.to,
      );
    });
  });

  describe('getExportStatus', () => {
    it('scopes the lookup to the current user', async () => {
      const job = { id: 'job-1', userId: 'user-1', status: 'COMPLETED' };
      mockAnalyticsService.getExportJob.mockResolvedValue(job);

      const result = await controller.getExportStatus(
        { user: mockCurrentUser } as any,
        'job-1',
      );

      expect(result).toEqual(job);
      expect(mockAnalyticsService.getExportJob).toHaveBeenCalledWith(
        'job-1',
        'user-1',
      );
    });
  });

  describe('downloadExport', () => {
    const makeResponse = () => {
      const res = {
        setHeader: jest.fn(),
        send: jest.fn(),
      };
      return res as unknown as import('express').Response;
    };

    it('streams the artifact with its content type', async () => {
      const buffer = Buffer.from('id,amount');
      mockAnalyticsService.getExportFile.mockResolvedValue({
        buffer,
        contentType: 'text/csv',
        filename: 'report-ab12cd34.csv',
      });
      const res = makeResponse();

      await controller.downloadExport(
        { user: mockCurrentUser } as any,
        'job-1',
        res,
      );

      expect(mockAnalyticsService.getExportFile).toHaveBeenCalledWith(
        'job-1',
        'user-1',
      );
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="report-ab12cd34.csv"',
      );
      expect(res.send).toHaveBeenCalledWith(buffer);
    });

    it('throws when the artifact has no buffer', async () => {
      mockAnalyticsService.getExportFile.mockResolvedValue({
        buffer: null as unknown as Buffer,
        contentType: 'text/csv',
        filename: 'report-ab12cd34.csv',
      });

      await expect(
        controller.downloadExport(
          { user: mockCurrentUser } as any,
          'job-1',
          makeResponse(),
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('assignCategory', () => {
    it('reassigns a transaction category for the current user', async () => {
      const dto = { categoryId: 'cat-1' };
      mockAnalyticsService.assignCategory.mockResolvedValue({
        id: 'tx-1',
        userId: 'user-1',
      });

      const result = await categoryController.assignCategory(
        { user: mockCurrentUser } as any,
        'tx-1',
        dto,
      );

      expect(result).toEqual({ id: 'tx-1', userId: 'user-1' });
      expect(mockAnalyticsService.assignCategory).toHaveBeenCalledWith(
        'tx-1',
        'user-1',
        'cat-1',
      );
    });
  });
});