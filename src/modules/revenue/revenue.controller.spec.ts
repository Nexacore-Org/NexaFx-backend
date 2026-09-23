import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { RevenueController, GenerateSnapshotDto, QuerySnapshotsDto } from './revenue.controller';
import { RevenueService } from './revenue.service';
import {
  RevenueSnapshot,
  RevenuePeriodType,
} from './entities/revenue-snapshot.entity';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/user.entity';

describe('RevenueController', () => {
  let controller: RevenueController;
  let revenueService: RevenueService;

  const mockSnapshot: RevenueSnapshot = {
    id: 'snap-123',
    periodType: RevenuePeriodType.DAILY,
    periodStart: new Date('2026-08-01T00:00:00Z'),
    periodEnd: new Date('2026-08-01T23:59:59Z'),
    totalTransactions: 10,
    totalVolumeUsd: '15000.00000000',
    totalFeeRevenueUsd: '75.00000000',
    feeBreakdown: { SWAP: '75.00000000' },
    currency: 'USD',
    isFinalized: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockRevenueService = {
    generateSnapshot: jest.fn(),
    getSnapshots: jest.fn(),
    getRevenueSummary: jest.fn(),
    finalizeSnapshot: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RevenueController],
      providers: [
        {
          provide: RevenueService,
          useValue: mockRevenueService,
        },
        Reflector,
      ],
    }).compile();

    controller = module.get<RevenueController>(RevenueController);
    revenueService = module.get<RevenueService>(RevenueService);
    jest.clearAllMocks();
  });

  describe('Access Control & Roles', () => {
    it('should be configured with ADMIN and SUPER_ADMIN roles', () => {
      const roles = Reflect.getMetadata(ROLES_KEY, RevenueController);
      expect(roles).toBeDefined();
      expect(roles).toContain(UserRole.ADMIN);
      expect(roles).toContain(UserRole.SUPER_ADMIN);
      expect(roles).not.toContain(UserRole.USER);
    });
  });

  describe('generateSnapshot', () => {
    it('should delegate snapshot generation to revenueService', async () => {
      const dto: GenerateSnapshotDto = {
        periodType: RevenuePeriodType.DAILY,
        periodStart: '2026-08-01T00:00:00Z',
        periodEnd: '2026-08-01T23:59:59Z',
      };
      mockRevenueService.generateSnapshot.mockResolvedValue(mockSnapshot);

      const result = await controller.generateSnapshot(dto);

      expect(result).toEqual(mockSnapshot);
      expect(mockRevenueService.generateSnapshot).toHaveBeenCalledWith({
        periodType: RevenuePeriodType.DAILY,
        periodStart: new Date(dto.periodStart),
        periodEnd: new Date(dto.periodEnd),
        forceRecalculate: undefined,
      });
    });
  });

  describe('getSnapshots', () => {
    it('should query snapshots with filters', async () => {
      const query: QuerySnapshotsDto = {
        periodType: RevenuePeriodType.DAILY,
        startDate: '2026-08-01',
        endDate: '2026-08-31',
      };
      mockRevenueService.getSnapshots.mockResolvedValue([mockSnapshot]);

      const result = await controller.getSnapshots(query);

      expect(result).toEqual([mockSnapshot]);
      expect(mockRevenueService.getSnapshots).toHaveBeenCalledWith({
        periodType: RevenuePeriodType.DAILY,
        startDate: new Date('2026-08-01'),
        endDate: new Date('2026-08-31'),
      });
    });
  });

  describe('getRevenueSummary', () => {
    it('should call service for summary between start and end dates', async () => {
      const summaryResult = {
        totalRevenueUsd: '150.00000000',
        totalVolumeUsd: '30000.00000000',
        totalTransactions: 20,
        periodCount: 2,
        periodStart: new Date('2026-08-01'),
        periodEnd: new Date('2026-08-02'),
        feeBreakdown: {},
      };
      mockRevenueService.getRevenueSummary.mockResolvedValue(summaryResult);

      const result = await controller.getRevenueSummary(
        '2026-08-01',
        '2026-08-02',
      );

      expect(result).toEqual(summaryResult);
      expect(mockRevenueService.getRevenueSummary).toHaveBeenCalledWith(
        new Date('2026-08-01'),
        new Date('2026-08-02'),
      );
    });
  });

  describe('finalizeSnapshot', () => {
    it('should delegate snapshot finalization to service', async () => {
      const finalized = { ...mockSnapshot, isFinalized: true };
      mockRevenueService.finalizeSnapshot.mockResolvedValue(finalized);

      const result = await controller.finalizeSnapshot('snap-123');

      expect(result.isFinalized).toBe(true);
      expect(mockRevenueService.finalizeSnapshot).toHaveBeenCalledWith('snap-123');
    });
  });
});
