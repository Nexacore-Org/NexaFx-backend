import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { RevenueSnapshot } from './entities/revenue-snapshot.entity';

export type Period = '7d' | '30d' | '90d';

@Injectable()
export class RevenueService {
  private readonly logger = new Logger(RevenueService.name);

  constructor(
    @InjectRepository(RevenueSnapshot)
    private readonly snapshotRepo: Repository<RevenueSnapshot>,
    private readonly dataSource: DataSource,
  ) {}

  @Cron('0 1 * * *')
  async dailySnapshot(): Promise<void> {
    this.logger.log('Running daily revenue snapshot…');

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().slice(0, 10);

    const existing = await this.snapshotRepo.findOne({ where: { date: dateStr } });
    if (existing) {
      this.logger.warn(`Snapshot for ${dateStr} already exists, skipping`);
      return;
    }

    const breakdown = await this.queryRevenueSources(dateStr);
    const totalUsd = Object.values(breakdown).reduce(
      (sum, val) => sum + Number(val),
      0,
    ).toString();

    const snapshot = this.snapshotRepo.create({
      date: dateStr,
      totalUsd,
      breakdown,
    });

    await this.snapshotRepo.save(snapshot);
    this.logger.log(`Snapshot created for ${dateStr}: $${totalUsd}`);
  }

  async getDashboard(period: Period) {
    const startDate = this.getStartDate(period);
    const snapshots = await this.snapshotRepo
      .createQueryBuilder('s')
      .where('s.date >= :startDate', { startDate })
      .orderBy('s.date', 'ASC')
      .getMany();

    return this.aggregateSnapshots(snapshots, period);
  }

  async getSnapshots(page: number = 1, limit: number = 20) {
    const [data, total] = await this.snapshotRepo.findAndCount({
      order: { date: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getRevenueByStream(
    stream: keyof RevenueSnapshot['breakdown'],
    period: Period,
  ) {
    const startDate = this.getStartDate(period);
    const snapshots = await this.snapshotRepo
      .createQueryBuilder('s')
      .where('s.date >= :startDate', { startDate })
      .orderBy('s.date', 'ASC')
      .getMany();

    const dates = snapshots.map((s) => s.date);
    const values = snapshots.map((s) => s.breakdown?.[stream] ?? '0');
    const totalUsd = values.reduce((sum, v) => sum + Number(v), 0).toString();

    return {
      stream,
      totalUsd,
      period,
      dates,
      values,
    };
  }

  private async queryRevenueSources(
    dateStr: string,
  ): Promise<RevenueSnapshot['breakdown']> {
    const qb = this.dataSource.createQueryBuilder();

    const platformFees = await qb
      .select('COALESCE(SUM(amount), 0)', 'val')
      .from('transactions', 't')
      .where("t.type = 'PLATFORM_FEE'")
      .andWhere("DATE(t.created_at) = :date", { date: dateStr })
      .getRawOne<{ val: string }>();

    const markupRevenue = await qb
      .select('COALESCE(SUM(amount), 0)', 'val')
      .from('transactions', 't')
      .where("t.type = 'MARKUP_REVENUE'")
      .andWhere("DATE(t.created_at) = :date", { date: dateStr })
      .getRawOne<{ val: string }>();

    const merchantCommissions = await qb
      .select('COALESCE(SUM(amount), 0)', 'val')
      .from('transactions', 't')
      .where("t.type = 'MERCHANT_COMMISSION'")
      .andWhere("DATE(t.created_at) = :date", { date: dateStr })
      .getRawOne<{ val: string }>();

    const loanInterest = await qb
      .select('COALESCE(SUM(amount), 0)', 'val')
      .from('transactions', 't')
      .where("t.type = 'LOAN_INTEREST'")
      .andWhere("DATE(t.created_at) = :date", { date: dateStr })
      .getRawOne<{ val: string }>();

    const stakingFees = await qb
      .select('COALESCE(SUM(amount), 0)', 'val')
      .from('transactions', 't')
      .where("t.type = 'STAKING_FEE'")
      .andWhere("DATE(t.created_at) = :date", { date: dateStr })
      .getRawOne<{ val: string }>();

    const subscriptionFees = await qb
      .select('COALESCE(SUM(amount), 0)', 'val')
      .from('transactions', 't')
      .where("t.type = 'SUBSCRIPTION_FEE'")
      .andWhere("DATE(t.created_at) = :date", { date: dateStr })
      .getRawOne<{ val: string }>();

    return {
      platformFees: platformFees?.val ?? '0',
      markupRevenue: markupRevenue?.val ?? '0',
      merchantCommissions: merchantCommissions?.val ?? '0',
      loanInterest: loanInterest?.val ?? '0',
      stakingFees: stakingFees?.val ?? '0',
      subscriptionFees: subscriptionFees?.val ?? '0',
    };
  }

  private aggregateSnapshots(snapshots: RevenueSnapshot[], period: Period) {
    const totals: Record<string, string> = {
      platformFees: '0',
      markupRevenue: '0',
      merchantCommissions: '0',
      loanInterest: '0',
      stakingFees: '0',
      subscriptionFees: '0',
    };

    for (const s of snapshots) {
      if (s.breakdown) {
        for (const key of Object.keys(totals) as Array<keyof typeof totals>) {
          totals[key] = (
            Number(totals[key]) + Number(s.breakdown[key] ?? 0)
          ).toString();
        }
      }
    }

    const totalUsd = Object.values(totals)
      .reduce((sum, v) => sum + Number(v), 0)
      .toString();

    return {
      totalUsd,
      breakdown: totals,
      period,
      dates: snapshots.map((s) => s.date),
    };
  }

  private getStartDate(period: Period): string {
    const now = new Date();
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    now.setDate(now.getDate() - days);
    return now.toISOString().slice(0, 10);
  }
}
