import { redisConnectionFromUrl } from './queue-connection';

describe('redisConnectionFromUrl', () => {
  it('falls back to a local redis when no url is configured', () => {
    expect(redisConnectionFromUrl()).toEqual({
      host: 'localhost',
      port: 6379,
      username: undefined,
      password: undefined,
      db: 0,
      maxRetriesPerRequest: null,
    });
  });

  it('parses host, port and database number', () => {
    const connection = redisConnectionFromUrl('redis://cache.internal:6380/3');

    expect(connection.host).toBe('cache.internal');
    expect(connection.port).toBe(6380);
    expect(connection.db).toBe(3);
  });

  it('parses credentials when they are present', () => {
    const connection = redisConnectionFromUrl(
      'redis://nexafx:s3cr3t@cache.internal:6379/1',
    );

    expect(connection.username).toBe('nexafx');
    expect(connection.password).toBe('s3cr3t');
  });

  it('leaves credentials undefined when the url has none', () => {
    const connection = redisConnectionFromUrl('redis://cache.internal:6379');

    expect(connection.username).toBeUndefined();
    expect(connection.password).toBeUndefined();
  });

  it('decodes percent-encoded passwords', () => {
    const connection = redisConnectionFromUrl(
      'redis://user:p%40ss%3Aword@cache.internal:6379/0',
    );

    expect(connection.password).toBe('p@ss:word');
  });

  it('always disables per-request retries so bull can handle reconnects', () => {
    expect(redisConnectionFromUrl('redis://cache.internal:6379/0')
      .maxRetriesPerRequest).toBeNull();
  });
});