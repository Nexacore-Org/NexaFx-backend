import { Injectable, Logger } from '@nestjs/common';
import * as https from 'https';
import * as http from 'http';

export interface StellarHealthResult {
  status: 'up' | 'down' | 'not_configured';
  message?: string;
  responseTimeMs?: number;
}

/**
 * Lightweight Stellar Horizon health indicator.
 *
 * Hits the Horizon root endpoint (`/`) which returns server metadata
 * without requiring authentication or expensive lookups.  A short
 * timeout ensures a slow Horizon cannot make the health endpoint hang.
 */
@Injectable()
export class StellarHealthIndicator {
  private readonly logger = new Logger(StellarHealthIndicator.name);
  private readonly timeoutMs: number;

  constructor() {
    this.timeoutMs = parseInt(
      process.env.HEALTH_STELLAR_TIMEOUT_MS ?? '5000',
      10,
    );
  }

  async isHealthy(): Promise<StellarHealthResult> {
    const horizonUrl = process.env.STELLAR_HORIZON_URL;

    if (!horizonUrl) {
      return {
        status: 'not_configured',
        message: 'STELLAR_HORIZON_URL not set — skipping Stellar health check',
      };
    }

    try {
      const rootUrl = horizonUrl.replace(/\/+$/, '') + '/';
      const start = Date.now();

      const statusCode = await this.httpGet(rootUrl);
      const responseTimeMs = Date.now() - start;

      if (statusCode >= 200 && statusCode < 400) {
        return { status: 'up', responseTimeMs };
      }

      return {
        status: 'down',
        message: `Horizon root returned HTTP ${statusCode}`,
        responseTimeMs,
      };
    } catch (error: any) {
      this.logger.error(`Stellar Horizon health check failed: ${error.message}`);
      return {
        status: 'down',
        message: error.message,
      };
    }
  }

  private httpGet(url: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const transport = parsedUrl.protocol === 'https:' ? https : http;

      const req = transport.get(url, { timeout: this.timeoutMs }, (res) => {
        // We only need the status code; drain the body so the socket can be reused.
        res.resume();
        resolve(res.statusCode ?? 0);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Horizon request timed out after ${this.timeoutMs}ms`));
      });

      req.on('error', (err) => {
        reject(err);
      });
    });
  }
}
