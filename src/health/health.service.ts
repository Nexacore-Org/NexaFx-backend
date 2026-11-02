import {
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RedisHealthIndicator } from './indicators/redis-health.indicator';
import { StellarHealthIndicator } from './indicators/stellar-health.indicator';
import { BullMQHealthIndicator } from './indicators/bullmq-health.indicator';
import { MailgunHealthIndicator } from './indicators/mailgun-health.indicator';

export type DependencyHealthStatus =
  'ok' | 'up' | 'down' | 'error' | 'disconnected' | 'not_configured';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly dataSource: DataSource,
    @Optional()
    private readonly redisHealthIndicator?: RedisHealthIndicator,
    @Optional()
    private readonly stellarHealthIndicator?: StellarHealthIndicator,
    @Optional()
    private readonly bullmqHealthIndicator?: BullMQHealthIndicator,
    @Optional()
    private readonly mailgunHealthIndicator?: MailgunHealthIndicator,
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
    const [dbStatus, redisStatus, stellarStatus, bullmqStatus, mailgunStatus] =
      await Promise.all([
        this.checkDatabase(),
        this.redisHealthIndicator
          ? this.redisHealthIndicator.isHealthy()
          : Promise.resolve({ status: 'not_configured' as const }),
        this.stellarHealthIndicator
          ? this.stellarHealthIndicator.isHealthy()
          : Promise.resolve({ status: 'not_configured' as const }),
        this.bullmqHealthIndicator
          ? this.bullmqHealthIndicator.isHealthy()
          : Promise.resolve({ status: 'not_configured' as const }),
        this.checkMailgun(),
      ]);

    // A dependency that is "not_configured" does NOT block readiness —
    // only "down" does.
    //
    // Critical dependencies (DB, Redis, BullMQ) gate readiness: if any of
    // them is down the instance cannot serve traffic and must be pulled
    // out of rotation. Degraded dependencies (Stellar, Mailgun) are
    // third-party services whose outage should not mark every pod
    // unready simultaneously; they are reported in details and set
    // `degraded: true` without failing readiness.
    const criticalReady =
      dbStatus === 'ok' &&
      redisStatus.status !== 'down' &&
      bullmqStatus.status !== 'down';

    const degraded =
      stellarStatus.status === 'down' || mailgunStatus.status === 'down';

    const body = {
      status: criticalReady ? ('ok' as const) : ('error' as const),
      degraded,
      details: {
        database: dbStatus,
        redis: redisStatus.status,
        stellar: stellarStatus.status,
        bullmq: bullmqStatus.status,
        mailgun: mailgunStatus.status,
      },
    };

    if (!criticalReady) {
      throw new ServiceUnavailableException(body);
    }

    return body;
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

  private async checkMailgun(): Promise<{
    status: 'up' | 'down' | 'not_configured';
    message?: string;
  }> {
    if (!this.mailgunHealthIndicator) {
      return { status: 'not_configured' };
    }

    try {
      const result = (await this.mailgunHealthIndicator.isHealthy(
        'mailgun',
      )) as Record<string, any>;

      if (
        result &&
        typeof result.status === 'string' &&
        ['up', 'down', 'not_configured'].includes(result.status)
      ) {
        return {
          status: result.status as 'up' | 'down' | 'not_configured',
          message: result.message,
        };
      }

      const entry = result?.mailgun;
      if (entry) {
        if (
          entry.status === 'down' &&
          typeof entry.message === 'string' &&
          entry.message.toLowerCase().includes('not configured')
        ) {
          return { status: 'not_configured', message: entry.message };
        }
        return {
          status: entry.status === 'up' ? 'up' : 'down',
          message: entry.message,
        };
      }

      return { status: 'up' };
    } catch (error: any) {
      const causeEntry = error?.causes?.mailgun;
      return {
        status: 'down',
        message: causeEntry?.message ?? error?.message ?? 'Mailgun unreachable',
      };
    }
  }

  private async checkDatabase(): Promise<string> {
    const timeoutMs = parseInt(process.env.HEALTH_DB_TIMEOUT_MS ?? '3000', 10);

    let timer: NodeJS.Timeout | undefined;

    try {
      if (this.dataSource.isInitialized === false) {
        return 'disconnected';
      }

      await Promise.race([
        this.dataSource.query('SELECT 1'),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(`Database query timed out after ${timeoutMs}ms`),
              ),
            timeoutMs,
          );
        }),
      ]);

      return 'ok';
    } catch (error: any) {
      this.logger.error(`Database health check failed: ${error.message}`);
      return 'error';
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }
}
