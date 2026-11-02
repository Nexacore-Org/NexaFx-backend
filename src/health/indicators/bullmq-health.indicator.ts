import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { EMAIL_QUEUE } from '../../modules/queues/queue.constants';
import { REDIS_CLIENT } from '../../modules/redis/redis.constants';
import { DEFAULT_REDIS_URL } from './redis-health.indicator';

export interface BullMQHealthResult {
  status: 'up' | 'down' | 'not_configured';
  message?: string;
  responseTimeMs?: number;
}

/**
 * BullMQ health indicator.
 *
 * Reuses the existing BullMQ queue Redis connection (or the shared
 * `REDIS_CLIENT`) rather than opening a brand-new ioredis connection
 * on every probe. Defaults to `redis://localhost:6379` when
 * `BULLMQ_REDIS_URL` and `REDIS_URL` are unset, consistent with
 * `QueuesModule`.
 */
@Injectable()
export class BullMQHealthIndicator implements OnModuleDestroy {
  private readonly logger = new Logger(BullMQHealthIndicator.name);
  private readonly timeoutMs: number;
  private sharedFallbackClient: Redis | null = null;

  constructor(
    @Optional()
    @InjectQueue(EMAIL_QUEUE)
    private readonly emailQueue?: Queue,
    @Optional()
    @Inject(REDIS_CLIENT)
    private readonly redisClient?: Redis,
    @Optional()
    private readonly configService?: ConfigService,
  ) {
    this.timeoutMs = parseInt(
      process.env.HEALTH_BULLMQ_TIMEOUT_MS ?? '3000',
      10,
    );
  }

  private async resolveClient(): Promise<{
    ping: () => Promise<string>;
    connect?: () => Promise<unknown>;
    status?: string;
  }> {
    if (this.emailQueue && this.emailQueue.client) {
      const queueClient = await this.emailQueue.client;
      if (queueClient && typeof queueClient.ping === 'function') {
        return queueClient as unknown as {
          ping: () => Promise<string>;
          connect?: () => Promise<unknown>;
          status?: string;
        };
      }
    }

    const bullmqUrl =
      this.configService?.get<string>('BULLMQ_REDIS_URL') ??
      process.env.BULLMQ_REDIS_URL;

    if (!bullmqUrl && this.redisClient) {
      return this.redisClient;
    }

    if (!this.sharedFallbackClient) {
      const redisUrl =
        bullmqUrl ??
        this.configService?.get<string>('REDIS_URL') ??
        process.env.REDIS_URL ??
        DEFAULT_REDIS_URL;

      this.sharedFallbackClient = new Redis(redisUrl, {
        connectTimeout: this.timeoutMs,
        enableReadyCheck: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 0,
        lazyConnect: true,
      });

      this.sharedFallbackClient.on('error', (err) => {
        this.logger.warn(`BullMQ health client error: ${err.message}`);
      });
    }

    return this.sharedFallbackClient;
  }

  private async runWithTimeout<T>(
    operation: () => Promise<T>,
    timeoutMessage: string,
  ): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        operation(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(timeoutMessage)),
            this.timeoutMs,
          );
        }),
      ]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  async isHealthy(): Promise<BullMQHealthResult> {
    try {
      const start = Date.now();
      const client = await this.runWithTimeout(
        () => this.resolveClient(),
        `BullMQ Redis connection timed out after ${this.timeoutMs}ms`,
      );

      if (
        typeof client.connect === 'function' &&
        (client.status === 'wait' ||
          client.status === 'end' ||
          client.status === 'close')
      ) {
        await this.runWithTimeout(
          () => client.connect!(),
          `BullMQ Redis connection timed out after ${this.timeoutMs}ms`,
        );
      }

      const pong = await this.runWithTimeout(
        () => client.ping(),
        `BullMQ Redis PING timed out after ${this.timeoutMs}ms`,
      );

      const responseTimeMs = Date.now() - start;

      if (pong !== 'PONG') {
        return {
          status: 'down',
          message: `Unexpected PING response from BullMQ Redis: ${pong}`,
          responseTimeMs,
        };
      }

      return { status: 'up', responseTimeMs };
    } catch (error: any) {
      this.logger.error(`BullMQ health check failed: ${error.message}`);
      return {
        status: 'down',
        message: error.message,
      };
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.sharedFallbackClient) {
      try {
        await this.sharedFallbackClient.quit();
      } catch {
        // Ignore cleanup errors
      } finally {
        this.sharedFallbackClient = null;
      }
    }
  }
}
