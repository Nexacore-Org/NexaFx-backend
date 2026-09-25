import { Injectable, Logger } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';

/**
 * Lightweight reachability/auth check against the Mailgun API.
 *
 * Mailgun is a NON-CRITICAL dependency: outbound transactional email
 * (password resets, KYC status, transaction confirmations) is degraded when
 * Mailgun is unreachable, but the platform itself keeps serving traffic. The
 * indicator therefore reports its own status without flipping the whole
 * service to unhealthy for load-balancer purposes.
 */
@Injectable()
export class MailgunHealthIndicator extends HealthIndicator {
  private readonly logger = new Logger(MailgunHealthIndicator.name);

  /** Short timeout so a slow Mailgun cannot block the whole health check. */
  private readonly timeoutMs = 3000;

  private readonly apiKey = process.env.MAILGUN_API_KEY;
  private readonly domain = process.env.MAILGUN_DOMAIN;
  private readonly baseUrl =
    process.env.MAILGUN_BASE_URL || 'https://api.mailgun.net/v3';

  async isHealthy(key = 'mailgun'): Promise<HealthIndicatorResult> {
    if (!this.apiKey || !this.domain) {
      // Not configured is not the same as unreachable; report it explicitly
      // rather than throwing so the aggregate endpoint stays responsive.
      return this.getStatus(key, false, {
        critical: false,
        message: 'Mailgun credentials are not configured',
      });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(
        `${this.baseUrl}/domains/${encodeURIComponent(this.domain)}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Basic ${Buffer.from(`api:${this.apiKey}`).toString(
              'base64',
            )}`,
          },
          signal: controller.signal,
        },
      );

      if (response.status === 401 || response.status === 403) {
        throw new HealthCheckError(
          'Mailgun auth failed',
          this.getStatus(key, false, {
            critical: false,
            statusCode: response.status,
            message: 'Mailgun authentication failed',
          }),
        );
      }

      if (!response.ok) {
        throw new HealthCheckError(
          'Mailgun unreachable',
          this.getStatus(key, false, {
            critical: false,
            statusCode: response.status,
            message: `Mailgun responded with ${response.status}`,
          }),
        );
      }

      return this.getStatus(key, true, { critical: false });
    } catch (error) {
      if (error instanceof HealthCheckError) {
        throw error;
      }

      const aborted = (error as Error)?.name === 'AbortError';
      this.logger.warn(
        `Mailgun health check failed: ${aborted ? 'timeout' : (error as Error)?.message}`,
      );

      throw new HealthCheckError(
        aborted ? 'Mailgun health check timed out' : 'Mailgun unreachable',
        this.getStatus(key, false, {
          critical: false,
          message: aborted
            ? `Mailgun did not respond within ${this.timeoutMs}ms`
            : (error as Error)?.message,
        }),
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
