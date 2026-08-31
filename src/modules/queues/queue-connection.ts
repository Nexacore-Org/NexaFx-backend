import { ConfigService } from '@nestjs/config';

export interface QueueRedisConnectionOptions {
  host: string;
  port: number;
  password?: string;
  username?: string;
  db?: number;
  tls?: Record<string, any>;
  maxRetriesPerRequest: null;
  enableReadyCheck: boolean;
  retryStrategy: (times: number) => number | null;
}

let cachedConnectionOptions: QueueRedisConnectionOptions | null = null;

/**
 * Returns a single, consistent Redis connection configuration object reused by every queue
 * rather than each queue module independently reconfiguring or creating ad-hoc configs.
 */
export function getQueueRedisConnection(
  configService?: ConfigService,
  forceNew = false,
): QueueRedisConnectionOptions {
  if (cachedConnectionOptions && !forceNew) {
    return cachedConnectionOptions;
  }

  const host =
    configService?.get<string>('REDIS_HOST') ||
    process.env.REDIS_HOST ||
    'localhost';
  const port = Number(
    configService?.get<number>('REDIS_PORT') ||
      process.env.REDIS_PORT ||
      6379,
  );
  const password =
    configService?.get<string>('REDIS_PASSWORD') ||
    process.env.REDIS_PASSWORD ||
    undefined;
  const username =
    configService?.get<string>('REDIS_USERNAME') ||
    process.env.REDIS_USERNAME ||
    undefined;
  const db = Number(
    configService?.get<number>('REDIS_DB') ||
      process.env.REDIS_DB ||
      0,
  );
  const useTls =
    configService?.get<string>('REDIS_TLS') === 'true' ||
    process.env.REDIS_TLS === 'true';

  const options: QueueRedisConnectionOptions = {
    host,
    port,
    ...(password ? { password } : {}),
    ...(username ? { username } : {}),
    db,
    ...(useTls ? { tls: {} } : {}),
    // BullMQ explicitly requires maxRetriesPerRequest to be null for blocking connections
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: (times: number) => {
      // Exponential backoff with max delay of 3000ms
      return Math.min(times * 100, 3000);
    },
  };

  cachedConnectionOptions = options;
  return options;
}

export function resetCachedQueueConnection(): void {
  cachedConnectionOptions = null;
}
