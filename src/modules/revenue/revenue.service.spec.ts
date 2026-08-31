import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import Decimal from 'decimal.js';
import { RevenueService } from './revenue.service';
import {
  RevenueSnapshot,
  RevenuePeriodType,
} from './entities/revenue-snapshot.entity';
import {
  Transaction,
  TransactionStatus,
  TransactionType,
} from '../../transactions/entities/transaction.entity';
import { createMockRepository } from '../../../test/mocks/factories';

describe('RevenueService', () => {
  let service: RevenueService;
  let mockSnapshotRepo: ReturnType<typeof createMockRepository>;
  let mockTxRepo: ReturnType<typeof createMockRepository>;

  beforeEach(async () => {
    mockSnapshotRepo = createMockRepository();
    mockTxRepo = createMockRepository();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RevenueService,
        {
          provide: getRepositoryToken(RevenueSnapshot),
          useValue: mockSnapshotRepo,
        },
        {
          provide: getRepositoryToken(Transaction),
          useValue: mockTxRepo,
        },
      ],
    }).compile();

    service = module.get<RevenueService>(RevenueService);
  });

  describe('generateSnapshot', () => {
    const periodStart = new Date('2026-08-01T00:00:00Z');
    const periodEnd = new Date('2026-08-01T23:59:59Z');

    it('should throw BadRequestException if periodEnd is before or equal to periodStart', async () => {
      await expect(
        service.generateSnapshot({
          periodType: RevenuePeriodType.DAILY,
          periodStart: new Date('2026-08-02'),
          periodEnd: new Date('2026-08-01'),
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should correctly aggregate fee revenue and volume from fixture transaction data using Decimal.js', async () => {
      // 3 successful fixture transactions
      const fixtureTransactions: Partial<Transaction>[] = [
        {
          id: 'tx-1',
          amount: '1000.50000000',
          type: TransactionType.SWAP,
          status: TransactionStatus.SUCCESS,
          failureReason: 'FEE:5.00250000',
          createdAt: new Date('2026-08-01T10:00:00Z'),
        },
        {
          id: 'tx-2',
          amount: '2000.25000000',
          type: TransactionType.WITHDRAW,
          status: TransactionStatus.SUCCESS,
          failureReason: 'FEE:10.00125000',
          createdAt: new Date('2026-08-01T12:00:00Z'),
        },
        {
          id: 'tx-3',
          amount: '500.00000000',
          type: TransactionType.SWAP,
          status: TransactionStatus.SUCCESS,
          failureReason: null, // Fallback 0.5% = 2.50000000
          createdAt: new Date('2026-08-01T15:00:00Z'),
        },
      ];

      mockSnapshotRepo.findOne.mockResolvedValue(null);
      mockTxRepo.find.mockResolvedValue(fixtureTransactions);
      mockSnapshotRepo.create.mockImplementation((dto) => ({ ...dto, id: 'snap-new' }));
      mockSnapshotRepo.save.mockImplementation((entity) => Promise.resolve(entity));

      const snapshot = await service.generateSnapshot({
        periodType: RevenuePeriodType.DAILY,
        periodStart,
        periodEnd,
      });

      expect(snapshot).toBeDefined();
      expect(snapshot.totalTransactions).toBe(3);

      // Verify Decimal.js precision for total volume: 1000.5 + 2000.25 + 500 = 3500.75000000
      const expectedVolume = new Decimal('1000.50000000')
        .plus('2000.25000000')
        .plus('500.00000000');
      expect(new Decimal(snapshot.totalVolumeUsd).equals(expectedVolume)).toBe(true);

      // Verify fee aggregation: 5.00250000 + 10.00125000 + 2.50000000 = 17.50375000
      const expectedFee = new Decimal('5.00250000')
        .plus('10.00125000')
        .plus('2.50000000');
      expect(new Decimal(snapshot.totalFeeRevenueUsd).equals(expectedFee)).toBe(true);

      // Verify breakdown per type
      const swapFee = new Decimal(snapshot.feeBreakdown[TransactionType.SWAP]);
      expect(swapFee.equals(new Decimal('7.50250000'))).toBe(true);

      const withdrawFee = new Decimal(snapshot.feeBreakdown[TransactionType.WITHDRAW]);
      expect(withdrawFee.equals(new Decimal('10.00125000'))).toBe(true);
    });

    it('should be idempotent: returning existing finalized snapshot without double counting', async () => {
      const existingFinalizedSnapshot: RevenueSnapshot = {
        id: 'existing-snap-id',
        periodType: RevenuePeriodType.DAILY,
        periodStart,
        periodEnd,
        totalTransactions: 10,
        totalVolumeUsd: '50000.00000000',
        totalFeeRevenueUsd: '250.00000000',
        feeBreakdown: { SWAP: '250.00000000' },
        currency: 'USD',
        isFinalized: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockSnapshotRepo.findOne.mockResolvedValue(existingFinalizedSnapshot);

      const result = await service.generateSnapshot({
        periodType: RevenuePeriodType.DAILY,
        periodStart,
        periodEnd,
      });

      // Should return exact existing object without querying transactions or re-saving
      expect(result).toBe(existingFinalizedSnapshot);
      expect(result.id).toBe('existing-snap-id');
      expect(mockTxRepo.find).not.toHaveBeenCalled();
      expect(mockSnapshotRepo.save).not.toHaveBeenCalled();
    });

    it('should re-aggregate when forceRecalculate is true even if snapshot already exists', async () => {
      const existingSnapshot: RevenueSnapshot = {
        id: 'existing-snap-id',
        periodType: RevenuePeriodType.DAILY,
        periodStart,
        periodEnd,
        totalTransactions: 1,
        totalVolumeUsd: '100.00000000',
        totalFeeRevenueUsd: '0.50000000',
        feeBreakdown: {},
        currency: 'USD',
        isFinalized: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockSnapshotRepo.findOne.mockResolvedValue(existingSnapshot);
      mockTxRepo.find.mockResolvedValue([
        {
          id: 'tx-new',
          amount: '200.00000000',
          type: TransactionType.SWAP,
          status: TransactionStatus.SUCCESS,
          failureReason: 'FEE:1.00000000',
          createdAt: new Date(),
        },
      ]);
      mockSnapshotRepo.save.mockImplementation((entity) => Promise.resolve(entity));

      const result = await service.generateSnapshot({
        periodType: RevenuePeriodType.DAILY,
        periodStart,
        periodEnd,
        forceRecalculate: true,
      });

      expect(mockTxRepo.find).toHaveBeenCalled();
      expect(new Decimal(result.totalVolumeUsd).equals(new Decimal('200.00000000'))).toBe(
        true,
      );
      expect(new Decimal(result.totalFeeRevenueUsd).equals(new Decimal('1.00000000'))).toBe(
        true,
      );
    });
  });

  describe('getRevenueSummary', () => {
    it('should aggregate totals from snapshots in range using Decimal.js', async () => {
      const startDate = new Date('2026-08-01');
      const endDate = new Date('2026-08-31');

      const mockSnapshots: Partial<RevenueSnapshot>[] = [
        {
          totalFeeRevenueUsd: '100.25500000',
          totalVolumeUsd: '20000.50000000',
          totalTransactions: 15,
          feeBreakdown: { SWAP: '75.25500000', WITHDRAW: '25.00000000' },
        },
        {
          totalFeeRevenueUsd: '200.74500000',
          totalVolumeUsd: '40000.50000000',
          totalTransactions: 30,
          feeBreakdown: { SWAP: '150.74500000', WITHDRAW: '50.00000000' },
        },
      ];

      mockSnapshotRepo.find.mockResolvedValue(mockSnapshots);

      const summary = await service.getRevenueSummary(startDate, endDate);

      expect(summary.totalTransactions).toBe(45);
      expect(summary.periodCount).toBe(2);

      // Decimal.js equality verification
      expect(
        new Decimal(summary.totalRevenueUsd).equals(new Decimal('301.00000000')),
      ).toBe(true);
      expect(
        new Decimal(summary.totalVolumeUsd).equals(new Decimal('60001.00000000')),
      ).toBe(true);
      expect(
        new Decimal(summary.feeBreakdown['SWAP']).equals(new Decimal('226.00000000')),
      ).toBe(true);
    });

    it('should throw BadRequestException if endDate <= startDate', async () => {
      await expect(
        service.getRevenueSummary(new Date('2026-08-10'), new Date('2026-08-05')),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('finalizeSnapshot', () => {
    it('should mark snapshot as finalized and persist', async () => {
      const unfinalized = {
        id: 'snap-123',
        isFinalized: false,
      } as RevenueSnapshot;

      mockSnapshotRepo.findOne.mockResolvedValue(unfinalized);
      mockSnapshotRepo.save.mockImplementation((entity) => Promise.resolve(entity));

      const result = await service.finalizeSnapshot('snap-123');

      expect(result.isFinalized).toBe(true);
      expect(mockSnapshotRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ isFinalized: true }),
      );
    });

    it('should throw NotFoundException if snapshot does not exist', async () => {
      mockSnapshotRepo.findOne.mockResolvedValue(null);

      await expect(service.finalizeSnapshot('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
