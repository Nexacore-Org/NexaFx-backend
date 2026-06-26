export function redisConnectionFromUrl(redisUrl?: string) {
  const url = new URL(redisUrl ?? 'redis://localhost:6379');

  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    db: Number(url.pathname.replace('/', '') || 0),
    maxRetriesPerRequest: null,
  };
}
