import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RedisHealthIndicator } from './indicators/redis-health.indicator';
import { StellarHealthIndicator } from './indicators/stellar-health.indicator';
import { BullMQHealthIndicator } from './indicators/bullmq-health.indicator';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly redisHealthIndicator: RedisHealthIndicator,
    private readonly stellarHealthIndicator: StellarHealthIndicator,
    private readonly bullmqHealthIndicator: BullMQHealthIndicator,
  ) {}

  /* ------------------------------------------------------------------ */
  /*  Liveness — is the process alive?  (no external deps)             */
  /* ------------------------------------------------------------------ */

  checkLiveness() {
    return {
      status: 'ok' as const,
      timestamp: new Date().toISOString(),
    };
  }

  /* ------------------------------------------------------------------ */
  /*  Readiness — can the instance serve traffic?                       */
  /* ------------------------------------------------------------------ */

  async checkReadiness() {
    const [dbStatus, redisStatus, stellarStatus, bullmqStatus] =
      await Promise.all([
        this.checkDatabase(),
        this.redisHealthIndicator.isHealthy(),
        this.stellarHealthIndicator.isHealthy(),
        this.bullmqHealthIndicator.isHealthy(),
      ]);

    // A dependency that is "not_configured" does NOT block readiness —
    // only "down" does.
    const allReady =
      dbStatus === 'ok' &&
      redisStatus.status !== 'down' &&
      stellarStatus.status !== 'down' &&
      bullmqStatus.status !== 'down';

    return {
      status: allReady ? ('ok' as const) : ('error' as const),
      details: {
        database: dbStatus,
        redis: redisStatus.status,
        stellar: stellarStatus.status,
        bullmq: bullmqStatus.status,
      },
    };
  }

  /* ------------------------------------------------------------------ */
  /*  Overall health (legacy endpoint — same semantics as readiness)     */
  /* ------------------------------------------------------------------ */

  async checkHealth() {
    return this.checkReadiness();
  }

  /* ------------------------------------------------------------------ */
  /*  Private helpers                                                    */
  /* ------------------------------------------------------------------ */

  private async checkDatabase(): Promise<string> {
    const timeoutMs = parseInt(
      process.env.HEALTH_DB_TIMEOUT_MS ?? '3000',
      10,
    );

    try {
      if (!this.dataSource.isInitialized) {
        return 'disconnected';
      }

      await Promise.race([
        this.dataSource.query('SELECT 1'),
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(`Database query timed out after ${timeoutMs}ms`),
              ),
            timeoutMs,
          ),
        ),
      ]);

      return 'ok';
    } catch (error: any) {
      this.logger.error(`Database health check failed: ${error.message}`);
      return 'error';
    }
  }
}
