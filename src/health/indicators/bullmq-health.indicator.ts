import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';

export interface BullMQHealthResult {
  status: 'up' | 'down' | 'not_configured';
  message?: string;
  responseTimeMs?: number;
}

/**
 * BullMQ health indicator.
 *
 * BullMQ queues run on top of Redis.  Rather than importing every
 * queue definition, this indicator pings the Redis instance that
 * backs the queues (configured via `BULLMQ_REDIS_URL`, falling back
 * to `REDIS_URL`).  A reachable Redis means the queue transport is
 * alive; a deep queue is *not* the same failure mode as a broken
 * connection.
 */
@Injectable()
export class BullMQHealthIndicator {
  private readonly logger = new Logger(BullMQHealthIndicator.name);
  private readonly timeoutMs: number;

  constructor() {
    this.timeoutMs = parseInt(
      process.env.HEALTH_BULLMQ_TIMEOUT_MS ?? '3000',
      10,
    );
  }

  async isHealthy(): Promise<BullMQHealthResult> {
    const redisUrl =
      process.env.BULLMQ_REDIS_URL ?? process.env.REDIS_URL;

    if (!redisUrl) {
      return {
        status: 'not_configured',
        message:
          'BULLMQ_REDIS_URL and REDIS_URL not set — skipping BullMQ health check',
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
            () =>
              reject(
                new Error(
                  `BullMQ Redis connection timed out after ${this.timeoutMs}ms`,
                ),
              ),
            this.timeoutMs,
          ),
        ),
      ]);

      const pong = await Promise.race([
        client.ping(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(
                  `BullMQ Redis PING timed out after ${this.timeoutMs}ms`,
                ),
              ),
            this.timeoutMs,
          ),
        ),
      ]);

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
      this.logger.error(
        `BullMQ health check failed: ${error.message}`,
      );
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
