import { Injectable, Logger } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';

/**
 * Confirms the Firebase Admin SDK is initialized and can reach its backend.
 *
 * Firebase powers push notifications and is a NON-CRITICAL dependency: a
 * Firebase outage degrades push delivery but must not flip the whole service
 * to unhealthy for load-balancer purposes.
 */
@Injectable()
export class FirebaseHealthIndicator extends HealthIndicator {
  private readonly logger = new Logger(FirebaseHealthIndicator.name);

  /** Short timeout so a slow Firebase cannot block the whole health check. */
  private readonly timeoutMs = 3000;

  async isHealthy(key = 'firebase'): Promise<HealthIndicatorResult> {
    let admin: any;
    try {
      // Lazy require so the module can be loaded even when firebase-admin is
      // not installed in a given environment.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      admin = require('firebase-admin');
    } catch (error) {
      return this.getStatus(key, false, {
        critical: false,
        message: 'firebase-admin is not available',
      });
    }

    const app =
      (admin.apps && admin.apps.length > 0 && admin.apps[0]) ||
      (typeof admin.app === 'function' ? admin.app() : undefined);

    if (!app) {
      return this.getStatus(key, false, {
        critical: false,
        message: 'Firebase Admin SDK is not initialized',
      });
    }

    try {
      const projectId =
        (app.options && app.options.projectId) ||
        process.env.FIREBASE_PROJECT_ID;

      if (!projectId) {
        return this.getStatus(key, false, {
          critical: false,
          message: 'Firebase project id is not configured',
        });
      }

      // Lightweight reachability call: fetch the project config from the
      // Firebase backend using the SDK's own credentials.
      const token = await this.withTimeout(
        app.INTERNAL.getToken(),
        this.timeoutMs,
      );

      const response = await this.withTimeout(
        fetch(
          `https://firebase.googleapis.com/v1beta1/projects/${encodeURIComponent(
            projectId,
          )}`,
          {
            method: 'GET',
            headers: { Authorization: `Bearer ${token.access_token}` },
          },
        ),
        this.timeoutMs,
      );

      if (response.status === 401 || response.status === 403) {
        throw new HealthCheckError(
          'Firebase auth failed',
          this.getStatus(key, false, {
            critical: false,
            statusCode: response.status,
            message: 'Firebase authentication failed',
          }),
        );
      }

      if (!response.ok) {
        throw new HealthCheckError(
          'Firebase unreachable',
          this.getStatus(key, false, {
            critical: false,
            statusCode: response.status,
            message: `Firebase responded with ${response.status}`,
          }),
        );
      }

      return this.getStatus(key, true, { critical: false });
    } catch (error) {
      if (error instanceof HealthCheckError) {
        throw error;
      }

      const timedOut = (error as Error)?.message === 'timeout';
      this.logger.warn(
        `Firebase health check failed: ${timedOut ? 'timeout' : (error as Error)?.message}`,
      );

      throw new HealthCheckError(
        timedOut ? 'Firebase health check timed out' : 'Firebase unreachable',
        this.getStatus(key, false, {
          critical: false,
          message: timedOut
            ? `Firebase did not respond within ${this.timeoutMs}ms`
            : (error as Error)?.message,
        }),
      );
    }
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), ms);
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }
}
