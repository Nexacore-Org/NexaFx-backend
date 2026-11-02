export interface RedisQueueConnectionOptions {
  host: string;
  port: number;
  username: string | undefined;
  password: string | undefined;
  db: number;
  maxRetriesPerRequest: null;
  tls?: Record<string, unknown>;
}

export function redisConnectionFromUrl(
  redisUrl?: string,
): RedisQueueConnectionOptions {
  const url = new URL(redisUrl ?? 'redis://localhost:6379');
  const isTls = url.protocol === 'rediss:';

  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: Number(url.pathname.replace('/', '') || 0),
    maxRetriesPerRequest: null,
    ...(isTls ? { tls: {} } : {}),
  };
}
