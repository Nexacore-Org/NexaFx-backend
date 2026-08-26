import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import {
  EMAIL_QUEUE,
  WEBHOOK_QUEUE,
  TAX_QUEUE,
} from '../modules/queues/queue.constants';
import {
  Transaction,
  TransactionStatus,
} from '../transactions/entities/transaction.entity';

export interface CronJobStatus {
  name: string;
  lastRun: Date | null;
  status: 'healthy' | 'stale' | 'unknown';
}

export interface QueueDepth {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
}

export interface DbPoolStats {
  totalConnections: number;
  idleConnections: number;
  activeConnections: number;
}

export interface ErrorCount {
  route: string;
  count: number;
}

export interface PlatformHealthSnapshot {
  timestamp: Date;
  cronJobs: CronJobStatus[];
  queues: QueueDepth[];
  database: DbPoolStats;
  recentErrors: ErrorCount[];
  overallStatus: 'healthy' | 'degraded' | 'critical';
}

@Injectable()
export class PlatformHealthRunbookService {
  private readonly logger = new Logger(PlatformHealthRunbookService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
    @InjectQueue(EMAIL_QUEUE)
    private readonly emailQueue: Queue,
    @InjectQueue(WEBHOOK_QUEUE)
    private readonly webhookQueue: Queue,
    @InjectQueue(TAX_QUEUE)
    private readonly taxQueue: Queue,
    private readonly dataSource: DataSource,
  ) {}

  async getSnapshot(): Promise<PlatformHealthSnapshot> {
    const [cronJobs, queues, database, recentErrors] = await Promise.all([
      this.getCronJobStatuses(),
      this.getQueueDepths(),
      this.getDbPoolStats(),
      this.getRecentErrors(),
    ]);

    const overallStatus = this.determineOverallStatus(
      cronJobs,
      queues,
      database,
      recentErrors,
    );

    return {
      timestamp: new Date(),
      cronJobs,
      queues,
      database,
      recentErrors,
      overallStatus,
    };
  }

  private async getCronJobStatuses(): Promise<CronJobStatus[]> {
    const jobs = [
      'heartbeat',
      'autoResumePairs',
      'processPendingTransactions',
      'cleanupExpiredOtps',
      'sendScheduledNotifications',
      'reconcileLedger',
    ];

    return Promise.all(
      jobs.map(async (name) => {
        try {
          const lastHeartbeat = await this.transactionRepo.findOne({
            where: { status: TransactionStatus.COMPLETED },
            order: { createdAt: 'DESC' },
          });

          return {
            name,
            lastRun: lastHeartbeat?.createdAt || null,
            status: lastHeartbeat ? 'healthy' : 'unknown',
          } as CronJobStatus;
        } catch {
          return { name, lastRun: null, status: 'unknown' } as CronJobStatus;
        }
      }),
    );
  }

  private async getQueueDepths(): Promise<QueueDepth[]> {
    const queues = [
      { name: EMAIL_QUEUE, queue: this.emailQueue },
      { name: WEBHOOK_QUEUE, queue: this.webhookQueue },
      { name: TAX_QUEUE, queue: this.taxQueue },
    ];

    return Promise.all(
      queues.map(async ({ name, queue }) => {
        try {
          const [waiting, active, completed, failed] = await Promise.all([
            queue.getWaitingCount(),
            queue.getActiveCount(),
            queue.getCompletedCount(),
            queue.getFailedCount(),
          ]);

          return { name, waiting, active, completed, failed };
        } catch {
          return { name, waiting: 0, active: 0, completed: 0, failed: 0 };
        }
      }),
    );
  }

  private async getDbPoolStats(): Promise<DbPoolStats> {
    try {
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();

      const result = await queryRunner.query(`
        SELECT 
          count(*) as "totalConnections",
          count(*) FILTER (WHERE state = 'idle') as "idleConnections",
          count(*) FILTER (WHERE state = 'active') as "activeConnections"
        FROM pg_stat_activity
        WHERE datname = current_database()
      `);

      await queryRunner.release();

      return {
        totalConnections: parseInt(result[0]?.totalConnections || '0'),
        idleConnections: parseInt(result[0]?.idleConnections || '0'),
        activeConnections: parseInt(result[0]?.activeConnections || '0'),
      };
    } catch {
      return { totalConnections: 0, idleConnections: 0, activeConnections: 0 };
    }
  }

  private async getRecentErrors(): Promise<ErrorCount[]> {
    try {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

      const errors = await this.transactionRepo
        .createQueryBuilder('t')
        .select('t.metadata->>\'route\'', 'route')
        .addSelect('COUNT(*)', 'count')
        .where('t.status = :status', { status: TransactionStatus.FAILED })
        .andWhere('t.createdAt > :since', { since: tenMinutesAgo })
        .groupBy('t.metadata->>\'route\'')
        .having('COUNT(*) > 0')
        .getRawMany();

      return errors.map((e) => ({
        route: e.route || 'unknown',
        count: parseInt(e.count),
      }));
    } catch {
      return [];
    }
  }

  private determineOverallStatus(
    cronJobs: CronJobStatus[],
    queues: QueueDepth[],
    database: DbPoolStats,
    recentErrors: ErrorCount[],
  ): 'healthy' | 'degraded' | 'critical' {
    const failedQueues = queues.filter((q) => q.failed > 10);
    const staleJobs = cronJobs.filter((j) => j.status === 'stale');
    const highErrorRate = recentErrors.reduce((sum, e) => sum + e.count, 0) > 50;

    if (failedQueues.length > 0 || staleJobs.length > 2 || highErrorRate) {
      return 'critical';
    }

    if (staleJobs.length > 0 || database.activeConnections > database.totalConnections * 0.8) {
      return 'degraded';
    }

    return 'healthy';
  }
}
