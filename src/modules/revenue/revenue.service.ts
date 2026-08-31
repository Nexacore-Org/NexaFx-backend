import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import Decimal from 'decimal.js';
import {
  RevenueSnapshot,
  RevenuePeriodType,
} from './entities/revenue-snapshot.entity';
import {
  Transaction,
  TransactionStatus,
  TransactionType,
} from '../../transactions/entities/transaction.entity';

export interface GenerateSnapshotOptions {
  periodType: RevenuePeriodType;
  periodStart: Date;
  periodEnd: Date;
  forceRecalculate?: boolean;
}

export interface RevenueSummaryResult {
  totalRevenueUsd: string;
  totalVolumeUsd: string;
  totalTransactions: number;
  periodCount: number;
  periodStart: Date;
  periodEnd: Date;
  feeBreakdown: Record<string, string>;
}

@Injectable()
export class RevenueService {
  private readonly logger = new Logger(RevenueService.name);

  constructor(
    @InjectRepository(RevenueSnapshot)
    private readonly snapshotRepository: Repository<RevenueSnapshot>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
  ) {}

  /**
   * Generates or retrieves a revenue snapshot for a specified period.
   * Ensures idempotency so repeated invocations for an already finalized period do not double count.
   */
  async generateSnapshot(
    options: GenerateSnapshotOptions,
  ): Promise<RevenueSnapshot> {
    const { periodType, periodStart, periodEnd, forceRecalculate } = options;

    if (new Date(periodEnd).getTime() <= new Date(periodStart).getTime()) {
      throw new BadRequestException('periodEnd must be strictly after periodStart');
    }

    // 1. Check idempotency: if snapshot already exists
    const existingSnapshot = await this.snapshotRepository.findOne({
      where: {
        periodType,
        periodStart,
        periodEnd,
      },
    });

    if (existingSnapshot && existingSnapshot.isFinalized && !forceRecalculate) {
      this.logger.log(
        `Snapshot for period ${periodType} (${periodStart.toISOString()} - ${periodEnd.toISOString()}) already exists and is finalized. Returning existing snapshot.`,
      );
      return existingSnapshot;
    }

    // 2. Fetch successful transactions executed within the period
    const transactions = await this.transactionRepository.find({
      where: {
        status: TransactionStatus.SUCCESS,
        createdAt: Between(periodStart, periodEnd),
      },
    });

    // 3. Aggregate volumes and fee revenues with Decimal.js to prevent floating point inaccuracies
    let totalVolumeDecimal = new Decimal(0);
    let totalFeeRevenueDecimal = new Decimal(0);
    const breakdownDecimals: Record<string, Decimal> = {};

    for (const tx of transactions) {
      const txAmount = new Decimal(tx.amount || 0);
      totalVolumeDecimal = totalVolumeDecimal.plus(txAmount);

      // Fee computation: assume fee in tx or flat/proportional calculation if not on tx entity
      const feeAmount = tx.failureReason?.startsWith('FEE:')
        ? new Decimal(tx.failureReason.replace('FEE:', ''))
        : new Decimal(tx.amount || 0).times(0.005); // Standard 0.5% platform fee fallback

      totalFeeRevenueDecimal = totalFeeRevenueDecimal.plus(feeAmount);

      const typeKey = tx.type || TransactionType.DEPOSIT;
      if (!breakdownDecimals[typeKey]) {
        breakdownDecimals[typeKey] = new Decimal(0);
      }
      breakdownDecimals[typeKey] = breakdownDecimals[typeKey].plus(feeAmount);
    }

    const feeBreakdown: Record<string, string> = {};
    for (const [typeKey, decimalVal] of Object.entries(breakdownDecimals)) {
      feeBreakdown[typeKey] = decimalVal.toFixed(8);
    }

    // 4. Save or update snapshot
    let snapshotToSave: RevenueSnapshot;
    if (existingSnapshot) {
      snapshotToSave = existingSnapshot;
      snapshotToSave.totalTransactions = transactions.length;
      snapshotToSave.totalVolumeUsd = totalVolumeDecimal.toFixed(8);
      snapshotToSave.totalFeeRevenueUsd = totalFeeRevenueDecimal.toFixed(8);
      snapshotToSave.feeBreakdown = feeBreakdown;
    } else {
      snapshotToSave = this.snapshotRepository.create({
        periodType,
        periodStart,
        periodEnd,
        totalTransactions: transactions.length,
        totalVolumeUsd: totalVolumeDecimal.toFixed(8),
        totalFeeRevenueUsd: totalFeeRevenueDecimal.toFixed(8),
        feeBreakdown,
        currency: 'USD',
        isFinalized: false,
      });
    }

    return await this.snapshotRepository.save(snapshotToSave);
  }

  /**
   * Returns list of revenue snapshots with optional date filtering.
   */
  async getSnapshots(filters?: {
    periodType?: RevenuePeriodType;
    startDate?: Date;
    endDate?: Date;
  }): Promise<RevenueSnapshot[]> {
    const where: any = {};
    if (filters?.periodType) {
      where.periodType = filters.periodType;
    }
    if (filters?.startDate && filters?.endDate) {
      where.periodStart = Between(filters.startDate, filters.endDate);
    }
    return this.snapshotRepository.find({
      where,
      order: { periodStart: 'DESC' },
    });
  }

  /**
   * Returns aggregated financial summary across periods using Decimal.js.
   */
  async getRevenueSummary(
    startDate: Date,
    endDate: Date,
  ): Promise<RevenueSummaryResult> {
    if (new Date(endDate).getTime() <= new Date(startDate).getTime()) {
      throw new BadRequestException('endDate must be strictly after startDate');
    }

    const snapshots = await this.snapshotRepository.find({
      where: {
        periodStart: Between(startDate, endDate),
      },
    });

    let totalRevenue = new Decimal(0);
    let totalVolume = new Decimal(0);
    let totalTransactions = 0;
    const combinedBreakdown: Record<string, Decimal> = {};

    for (const snap of snapshots) {
      totalRevenue = totalRevenue.plus(new Decimal(snap.totalFeeRevenueUsd || 0));
      totalVolume = totalVolume.plus(new Decimal(snap.totalVolumeUsd || 0));
      totalTransactions += snap.totalTransactions || 0;

      if (snap.feeBreakdown) {
        for (const [key, val] of Object.entries(snap.feeBreakdown)) {
          if (!combinedBreakdown[key]) {
            combinedBreakdown[key] = new Decimal(0);
          }
          combinedBreakdown[key] = combinedBreakdown[key].plus(new Decimal(val || 0));
        }
      }
    }

    const feeBreakdown: Record<string, string> = {};
    for (const [key, val] of Object.entries(combinedBreakdown)) {
      feeBreakdown[key] = val.toFixed(8);
    }

    return {
      totalRevenueUsd: totalRevenue.toFixed(8),
      totalVolumeUsd: totalVolume.toFixed(8),
      totalTransactions,
      periodCount: snapshots.length,
      periodStart: startDate,
      periodEnd: endDate,
      feeBreakdown,
    };
  }

  /**
   * Finalizes a revenue snapshot, locking it against automatic modifications.
   */
  async finalizeSnapshot(id: string): Promise<RevenueSnapshot> {
    const snapshot = await this.snapshotRepository.findOne({ where: { id } });
    if (!snapshot) {
      throw new NotFoundException(`Revenue snapshot with ID ${id} not found`);
    }
    snapshot.isFinalized = true;
    return await this.snapshotRepository.save(snapshot);
  }
}
