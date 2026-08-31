import { Injectable, Logger, NotFoundException } from '@nestjs/common';

export interface QueueJobCounts {
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  waiting: number;
  paused: number;
}

export interface QueueStateReport {
  name: string;
  isPaused: boolean;
  counts: QueueJobCounts;
  recentFailedJobs?: Array<{
    id: string;
    name: string;
    failedReason: string;
    attemptsMade: number;
    timestamp: number;
  }>;
}

export interface IQueueInstance {
  name: string;
  getJobCounts: () => Promise<QueueJobCounts>;
  isPaused?: () => Promise<boolean>;
  getFailed?: (start: number, end: number) => Promise<any[]>;
  retryJobs?: () => Promise<void>;
  clean?: (gracePeriodMs: number, limit: number, type: string) => Promise<string[]>;
  pause?: () => Promise<void>;
  resume?: () => Promise<void>;
}

@Injectable()
export class QueuesDashboardService {
  private readonly logger = new Logger(QueuesDashboardService.name);
  private readonly registeredQueues: Map<string, IQueueInstance> = new Map();

  /**
   * Registers a BullMQ queue instance with the dashboard.
   */
  registerQueue(name: string, queue: IQueueInstance): void {
    this.registeredQueues.set(name, queue);
    this.logger.log(`Registered queue '${name}' with QueuesDashboardService`);
  }

  /**
   * Unregisters a queue.
   */
  unregisterQueue(name: string): boolean {
    return this.registeredQueues.delete(name);
  }

  /**
   * Returns list of all registered queue names.
   */
  getRegisteredQueueNames(): string[] {
    return Array.from(this.registeredQueues.keys());
  }

  /**
   * Reports real-time state and job counts for a specific queue.
   */
  async getQueueState(name: string): Promise<QueueStateReport> {
    const queue = this.registeredQueues.get(name);
    if (!queue) {
      throw new NotFoundException(`Queue '${name}' is not registered`);
    }

    const counts = await queue.getJobCounts();
    const isPaused = queue.isPaused ? await queue.isPaused() : false;

    let recentFailedJobs: QueueStateReport['recentFailedJobs'] = [];
    if (queue.getFailed) {
      const failed = await queue.getFailed(0, 10);
      recentFailedJobs = failed.map((job) => ({
        id: String(job.id),
        name: job.name || 'default',
        failedReason: job.failedReason || 'Unknown error',
        attemptsMade: job.attemptsMade || 1,
        timestamp: job.timestamp || Date.now(),
      }));
    }

    return {
      name,
      isPaused,
      counts,
      recentFailedJobs,
    };
  }

  /**
   * Reports states for all registered queues in the application.
   */
  async getAllQueuesState(): Promise<Record<string, QueueStateReport>> {
    const reports: Record<string, QueueStateReport> = {};

    for (const [name] of this.registeredQueues) {
      try {
        reports[name] = await this.getQueueState(name);
      } catch (err) {
        this.logger.error(`Error retrieving state for queue '${name}':`, err);
      }
    }

    return reports;
  }

  /**
   * Retries all failed jobs on a specific queue.
   */
  async retryFailedJobs(name: string): Promise<void> {
    const queue = this.registeredQueues.get(name);
    if (!queue) {
      throw new NotFoundException(`Queue '${name}' is not registered`);
    }

    if (queue.retryJobs) {
      await queue.retryJobs();
      this.logger.log(`Triggered retry for failed jobs on queue '${name}'`);
    }
  }

  /**
   * Cleans old jobs from a queue.
   */
  async cleanQueue(
    name: string,
    gracePeriodMs = 86400000,
    type: 'completed' | 'failed' = 'completed',
  ): Promise<string[]> {
    const queue = this.registeredQueues.get(name);
    if (!queue) {
      throw new NotFoundException(`Queue '${name}' is not registered`);
    }

    if (queue.clean) {
      return await queue.clean(gracePeriodMs, 1000, type);
    }
    return [];
  }
}
