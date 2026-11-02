import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../modules/redis/redis.constants';

export const DEFAULT_REDIS_URL = 'redis://localhost:6379';

export interface RedisHealthResult {
  status: 'up' | 'down' | 'not_configured';
  message?: string;
  responseTimeMs?: number;
}

@Injectable()
export class RedisHealthIndicator implements OnModuleDestroy {
  private readonly logger = new Logger(RedisHealthIndicator.name);
  private readonly timeoutMs: number;
  private sharedFallbackClient: Redis | null = null;

  constructor(
    @Optional()
    @Inject(REDIS_CLIENT)
    private readonly redisClient?: Redis,
    @Optional()
    private readonly configService?: ConfigService,
  ) {
    this.timeoutMs = parseInt(
      process.env.HEALTH_REDIS_TIMEOUT_MS ?? '3000',
      10,
    );
  }

  private getClient(): Redis {
    if (this.redisClient) {
      return this.redisClient;
    }

    if (!this.sharedFallbackClient) {
      const redisUrl =
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
        this.logger.warn(`Redis health client error: ${err.message}`);
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

  /**
   * Pings Redis via the shared REDIS_CLIENT connection with a short timeout.
   * Defaults to redis://localhost:6379 when REDIS_URL is unset, matching
   * RedisModule and QueuesModule.
   */
  async isHealthy(): Promise<RedisHealthResult> {
    try {
      const client = this.getClient();
      const start = Date.now();

      const status = (client as { status?: string }).status;
      if (
        typeof client.connect === 'function' &&
        (status === 'wait' || status === 'end' || status === 'close')
      ) {
        await this.runWithTimeout(
          () => client.connect(),
          `Redis connection timed out after ${this.timeoutMs}ms`,
        );
      }

      const pong = await this.runWithTimeout(
        () => client.ping(),
        `Redis PING timed out after ${this.timeoutMs}ms`,
      );

      const responseTimeMs = Date.now() - start;

      if (pong !== 'PONG') {
        return {
          status: 'down',
          message: `Unexpected PING response: ${pong}`,
          responseTimeMs,
        };
      }

      return { status: 'up', responseTimeMs };
    } catch (error: any) {
      this.logger.error(`Redis health check failed: ${error.message}`);
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
