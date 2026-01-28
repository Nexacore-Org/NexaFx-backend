/**
 * Example configuration for Scheduled Jobs Module
 * Copy this to customize job behavior
 */

/**
 * Cron expression presets for different update frequencies
 */
export const CRON_SCHEDULES = {
  // Every 30 seconds - Use only for testing
  VERY_FREQUENT: '*/30 * * * * *',

  // Every minute
  FREQUENT: '* * * * *',

  // Every 2 minutes
  MODERATE: '*/2 * * * *',

  // Every 5 minutes
  NORMAL: '*/5 * * * *',

  // Every 10 minutes
  RELAXED: '*/10 * * * *',

  // Every hour
  HOURLY: '0 * * * *',

  // Daily at 2 AM
  DAILY: '0 2 * * *',

  // Weekly on Monday at 2 AM
  WEEKLY: '0 2 * * 1',

  // Monthly on 1st at 2 AM
  MONTHLY: '0 2 1 * *',
};

/**
 * Transaction reconciliation configuration
 */
export const RECONCILIATION_CONFIG = {
  // How often to check for pending transactions
  interval: CRON_SCHEDULES.MODERATE, // Every 2 minutes

  // Maximum transactions to process in one batch
  batchSize: 100,

  // Timeout for Stellar API calls (in milliseconds)
  stellarTimeout: 30000,

  // Retry logic for temporary failures
  retryConfig: {
    maxAttempts: 3,
    backoffMs: 1000, // Start with 1 second
    backoffMultiplier: 2, // Double each time
  },

  // Skip transactions older than this (in days)
  // Set to 0 to disable age limit
  maxAgeInDays: 30,

  // Log detailed information for debugging
  verboseLogs: process.env.NODE_ENV === 'development',
};

/**
 * Failed transaction retry configuration
 */
export const RETRY_CONFIG = {
  // How often to retry failed transactions
  interval: CRON_SCHEDULES.NORMAL, // Every 5 minutes

  // How far back to look for failed transactions (in hours)
  lookbackHours: 24,

  // Maximum transactions to process in one batch
  batchSize: 50,

  // Skip if too many recent failures (circuit breaker)
  circuitBreakerThreshold: 100,
};

/**
 * Notification configuration
 */
export const NOTIFICATION_CONFIG = {
  // Send notifications for successful transactions
  sendOnSuccess: true,

  // Send notifications for failed transactions
  sendOnFailure: true,

  // Notification message templates
  templates: {
    depositSuccess: (amount: string, currency: string) =>
      `Your deposit of ${amount} ${currency} has been confirmed`,

    depositFailed: (amount: string, currency: string) =>
      `Your deposit of ${amount} ${currency} failed`,

    withdrawalSuccess: (amount: string, currency: string) =>
      `Your withdrawal of ${amount} ${currency} has been confirmed`,

    withdrawalFailed: (amount: string, currency: string) =>
      `Your withdrawal of ${amount} ${currency} failed`,
  },
};

/**
 * Cleanup configuration
 */
export const CLEANUP_CONFIG = {
  // How often to run cleanup jobs
  interval: CRON_SCHEDULES.DAILY, // Daily at 2 AM

  // Retention period for notifications (in days)
  notificationRetentionDays: 90,

  // Retention period for completed transactions (in days)
  transactionRetentionDays: 365,

  // Archive instead of delete
  archiveInsteadOfDelete: true,
};

/**
 * Logging configuration
 */
export const LOGGING_CONFIG = {
  // Enable detailed logging
  enableDetailedLogs: process.env.NODE_ENV === 'development',

  // Log to external service (e.g., Datadog, New Relic)
  externalLogging: {
    enabled: false,
    service: 'datadog', // 'datadog', 'sentry', 'newrelic'
    dsn: process.env.EXTERNAL_LOGGING_DSN,
  },

  // Log levels
  levels: {
    job: 'info',
    reconciliation: 'debug',
    balance: 'debug',
    notification: 'info',
  },
};

/**
 * Monitoring and alerts configuration
 */
export const MONITORING_CONFIG = {
  // Enable Prometheus metrics
  enableMetrics: false,

  // Alert thresholds
  alerts: {
    // Alert if reconciliation takes longer than (in seconds)
    maxExecutionTime: 300,

    // Alert if more than N transactions fail in one run
    failureThreshold: 10,

    // Alert if Stellar API is down for more than (in minutes)
    apiDownThreshold: 5,
  },

  // Health check endpoint
  healthCheck: {
    enabled: true,
    path: '/health/scheduled-jobs',
  },
};

/**
 * Feature flags
 */
export const FEATURE_FLAGS = {
  // Enable pending transaction reconciliation
  enableReconciliation: true,

  // Enable failed transaction retry
  enableRetry: true,

  // Enable automatic notification creation
  enableNotifications: true,

  // Enable automatic balance updates
  enableBalanceUpdates: true,

  // Enable cleanup jobs
  enableCleanup: true,

  // Dry-run mode (log changes without saving)
  dryRun: false,
};

/**
 * Performance tuning
 */
export const PERFORMANCE_CONFIG = {
  // Use connection pooling for database
  useConnectionPool: true,

  // Pool size
  poolSize: 10,

  // Maximum concurrent Stellar API calls
  maxConcurrentStellarCalls: 5,

  // Cache transaction verification results (in seconds)
  verificationCacheTtl: 300,

  // Enable query optimization
  optimizeQueries: true,
};

/**
 * Example usage in scheduled-jobs.service.ts:
 *
 * import { RECONCILIATION_CONFIG, FEATURE_FLAGS } from './config.example';
 *
 * @Cron(RECONCILIATION_CONFIG.interval)
 * async reconcilePendingTransactions(): Promise<void> {
 *   if (!FEATURE_FLAGS.enableReconciliation) {
 *     this.logger.log('Reconciliation disabled via feature flag');
 *     return;
 *   }
 *
 *   // ... rest of implementation
 * }
 */

// Export all configurations
export const SCHEDULED_JOBS_CONFIG = {
  RECONCILIATION_CONFIG,
  RETRY_CONFIG,
  NOTIFICATION_CONFIG,
  CLEANUP_CONFIG,
  LOGGING_CONFIG,
  MONITORING_CONFIG,
  FEATURE_FLAGS,
  PERFORMANCE_CONFIG,
};
