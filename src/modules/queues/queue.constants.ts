export const QUEUE_NAMES = {
  TRANSACTIONS: 'transactions',
  NOTIFICATIONS: 'notifications',
  EMAILS: 'emails',
  WEBHOOKS: 'webhooks',
  AUDIT_LOGS: 'audit_logs',
  RATE_ALERTS: 'rate_alerts',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const QUEUE_CONNECTION_TOKEN = 'BULL_MQ_REDIS_CONNECTION';

export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000,
  },
  removeOnComplete: 100,
  removeOnFail: 500,
};
