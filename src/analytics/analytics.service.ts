import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { BalanceSnapshot } from './entities/balance-snapshot.entity';
import { ReportExportJob } from './entities/report-export-job.entity';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @InjectRepository(BalanceSnapshot)
    private readonly balanceSnapshotRepository: Repository<BalanceSnapshot>,
    @InjectRepository(ReportExportJob)
    private readonly reportExportJobRepository: Repository<ReportExportJob>,
  ) {}

  async recordBalanceSnapshot(
    userId: string,
    snapshotDate: Date,
    data: Partial<BalanceSnapshot>,
  ): Promise<BalanceSnapshot> {
    await this.balanceSnapshotRepository
      .createQueryBuilder()
      .insert()
      .into(BalanceSnapshot)
      .values({
        ...data,
        userId,
        snapshotDate,
      })
      .orIgnore()
      .execute();

    const snapshot = await this.balanceSnapshotRepository.findOne({
      where: { userId, snapshotDate },
    });

    if (!snapshot) {
      throw new NotFoundException('Balance snapshot could not be recorded');
    }

    return snapshot;
  }

  async getBalanceHistory(
    userId: string,
    from: Date,
    to: Date,
  ): Promise<BalanceSnapshot[]> {
    return this.balanceSnapshotRepository.find({
      where: {
        userId,
        snapshotDate: Between(from, to),
      },
      order: { snapshotDate: 'ASC' },
    });
  }

  async getLatestSnapshot(userId: string): Promise<BalanceSnapshot | null> {
    return this.balanceSnapshotRepository.findOne({
      where: { userId },
      order: { snapshotDate: 'DESC' },
    });
  }

  async createExportJob(
    userId: string,
    data: Partial<ReportExportJob>,
  ): Promise<ReportExportJob> {
    const job = this.reportExportJobRepository.create({
      ...data,
      userId,
    });
    return this.reportExportJobRepository.save(job);
  }

  async getExportJob(id: string): Promise<ReportExportJob> {
    const job = await this.reportExportJobRepository.findOne({ where: { id } });
    if (!job) {
      throw new NotFoundException(`Export job ${id} not found`);
    }
    return job;
  }

  async updateExportJob(
    id: string,
    data: Partial<ReportExportJob>,
  ): Promise<ReportExportJob> {
    await this.reportExportJobRepository.update(id, data);
    return this.getExportJob(id);
  }

  async listExportJobs(userId: string): Promise<ReportExportJob[]> {
    return this.reportExportJobRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async getSnapshotsBefore(
    userId: string,
    date: Date,
  ): Promise<BalanceSnapshot[]> {
    return this.balanceSnapshotRepository.find({
      where: { userId, snapshotDate: LessThanOrEqual(date) },
      order: { snapshotDate: 'DESC' },
    });
  }

  async getSnapshotsAfter(
    userId: string,
    date: Date,
  ): Promise<BalanceSnapshot[]> {
    return this.balanceSnapshotRepository.find({
      where: { userId, snapshotDate: MoreThanOrEqual(date) },
      order: { snapshotDate: 'ASC' },
    });
  }
}
