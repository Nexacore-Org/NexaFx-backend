import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';

export interface RedisHealthResult {
  status: 'up' | 'down' | 'not_configured';
  message?: string;
  responseTimeMs?: number;
}

@Injectable()
export class RedisHealthIndicator {
  private readonly logger = new Logger(RedisHealthIndicator.name);
  private readonly timeoutMs: number;

  constructor() {
    this.timeoutMs = parseInt(process.env.HEALTH_REDIS_TIMEOUT_MS ?? '3000', 10);
  }

  /**
   * Pings Redis with a short timeout.
   *
   * If `REDIS_URL` is not configured the check returns `not_configured`
   * so that the readiness probe is not tripped by an intentionally
   * absent Redis deployment.
   */
  async isHealthy(): Promise<RedisHealthResult> {
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
      return {
        status: 'not_configured',
        message: 'REDIS_URL not set — skipping Redis health check',
      };
    }

    let client: Redis | null = null;

    try {
      client = new Redis(redisUrl, {
        connectTimeout: this.timeoutMs,
        enableReadyCheck: true,
        maxRetriesPerRequest: 0,
        lazyConnect: true,
      });

      const start = Date.now();
      await Promise.race([
        client.connect(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Redis PING timed out after ${this.timeoutMs}ms`)),
            this.timeoutMs,
          ),
        ),
      ]);

      const pong = await Promise.race([
        client.ping(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Redis PING timed out after ${this.timeoutMs}ms`)),
            this.timeoutMs,
          ),
        ),
      ]);

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
    } finally {
      if (client) {
        try {
          await client.quit();
        } catch {
          // Ignore errors during cleanup
        }
      }
    }
  }
}
