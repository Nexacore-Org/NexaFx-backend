const isSqliteTestRuntime =
  process.env.NODE_ENV === 'test' || process.env.TEST_DATABASE === 'sqlite';

export const DB_COLUMN_TYPES = {
  enum: isSqliteTestRuntime ? 'simple-enum' : 'enum',
  json: isSqliteTestRuntime ? 'simple-json' : 'jsonb',
  timestamp: isSqliteTestRuntime ? 'datetime' : 'timestamp with time zone',
  inet: isSqliteTestRuntime ? 'varchar' : 'inet',
} as const;
