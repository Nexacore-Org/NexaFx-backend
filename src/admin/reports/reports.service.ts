import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { User } from '../users/user.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { ReportSchedule } from './report-schedule.entity';
import { ReportJob } from './report-job.entity';
import * as csv from 'csv-stringify';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';

const stringify = promisify(csv);

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(ReportSchedule)
    private readonly reportScheduleRepository: Repository<ReportSchedule>,
    @InjectRepository(ReportJob)
    private readonly reportJobRepository: Repository<ReportJob>,
  ) {}

  async getRevenueReport(
    from: string,
    to: string,
    currency: string,
    format?: string,
  ): Promise<string | any[]> {
    const query = this.transactionRepository
      .createQueryBuilder('t')
      .select([
        't.feeCurrency as currency',
        'SUM(CASE WHEN t.type = :deposit THEN t.feeAmount ELSE 0 END) as exchangeFee',
        'SUM(CASE WHEN t.type = :withdraw THEN t.feeAmount ELSE 0 END) as networkFee',
        'SUM(CASE WHEN t.type = :swap THEN t.feeAmount ELSE 0 END) as spread',
      ])
      .where('t.createdAt BETWEEN :from AND :to', {
        from: new Date(from),
        to: new Date(to),
      })
      .setParameters({
        deposit: 'DEPOSIT',
        withdraw: 'WITHDRAW',
        swap: 'SWAP',
      });

    if (currency) {
      query.andWhere('t.feeCurrency = :currency', { currency });
    }

    const result = await query.groupBy('t.feeCurrency').getRawMany();

    if (format === 'csv') {
      const csvData: string = await stringify(result);
      return csvData;
    }

    return result;
  }

  async getCohortReport(month: string, format?: string) {
    const [year, monthNum] = month.split('-');
    const startDate = new Date(`${year}-${monthNum}-01`);
    const endDate = new Date(year, parseInt(monthNum), 0); // Last day of the month

    // Users acquired in the month
    const users = await this.userRepository.find({
      where: {
        createdAt: Between(startDate, endDate),
      },
    });

    // For simplicity, we'll return mock retention data
    const cohortData = {
      month,
      acquired: users.length,
      retention: {
        day30: Math.floor(Math.random() * 100),
        day60: Math.floor(Math.random() * 100),
        day90: Math.floor(Math.random() * 100),
      },
    };

    if (format === 'csv') {
      const csvData: string = await stringify([cohortData]);
      return csvData;
    }

    return cohortData;
  }

  async getFunnelReport(format?: string): Promise<string | any[]> {
    const statusCounts = await this.transactionRepository
      .createQueryBuilder('t')
      .select('t.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('t.status')
      .getRawMany();

    const total = statusCounts.reduce(
      (sum, row) => sum + parseInt(row.count),
      0,
    );

    const funnelData = statusCounts.map((row) => ({
      status: row.status,
      count: parseInt(row.count),
      percentage: ((parseInt(row.count) / total) * 100).toFixed(2) + '%',
    }));

    if (format === 'csv') {
      const csvData: string = await stringify(funnelData);
      return csvData;
    }

    return funnelData;
  }

  async getTopUsersReport(
    limit: number,
    metric: 'volume' | 'count',
    format?: string,
  ): Promise<string | any[]> {
    const query = this.transactionRepository
      .createQueryBuilder('t')
      .select('t.userId', 'userId')
      .addSelect('COUNT(*)', 'transactionCount')
      .addSelect('SUM(t.amount)', 'volume')
      .groupBy('t.userId')
      .orderBy(metric === 'volume' ? 'volume' : 'transactionCount', 'DESC')
      .limit(limit);

    if (format === 'csv') {
      const result = await query.getRawMany();
      const csvData: string = await stringify(result);
      return csvData;
    }

    return query.getRawMany();
  }

  async createReportJob(parameters: any): Promise<{ jobId: string }> {
    const jobId = uuidv4();
    const job = this.reportJobRepository.create({
      jobId,
      status: 'PENDING',
      parameters: JSON.stringify(parameters),
    });
    await this.reportJobRepository.save(job);

    // In a real implementation, we would trigger an async job here.
    // For now, we'll just return the jobId.
    return { jobId };
  }

  async getReportJob(jobId: string) {
    const job = await this.reportJobRepository.findOne({ where: { jobId } });
    if (!job) {
      throw new NotFoundException(`Job with jobId ${jobId} not found`);
    }
    return job;
  }

  async createReportSchedule(
    reportType: string,
    frequency: string,
    recipientEmail: string,
    parameters: any,
  ) {
    const schedule = this.reportScheduleRepository.create({
      reportType,
      frequency,
      recipientEmail,
      parameters: JSON.stringify(parameters),
      nextRunAt: new Date(), // Set to now for simplicity, but in reality would calculate based on frequency
      active: true,
    });
    return this.reportScheduleRepository.save(schedule);
  }
}
