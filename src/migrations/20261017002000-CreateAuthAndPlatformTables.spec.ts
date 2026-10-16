import { QueryRunner } from 'typeorm';
import { CreateAuthAndPlatformTables20261017002000 } from './20261017002000-CreateAuthAndPlatformTables';

const TABLES = [
  'refresh_tokens',
  'otps',
  'backup_codes',
  'password_reset_attempts',
  'rate_limit_configs',
  'data_requests',
  'idempotency_records',
];

const runUp = async (existingTables: string[]) => {
  const queries: string[] = [];
  const queryRunner = {
    hasTable: jest.fn(async (table: string) => existingTables.includes(table)),
    query: jest.fn(async (sql: string) => {
      queries.push(sql);
    }),
  } as unknown as QueryRunner;

  await new CreateAuthAndPlatformTables20261017002000().up(queryRunner);

  return { queries, sql: queries.join('\n') };
};

describe('CreateAuthAndPlatformTables migration', () => {
  it('creates every auth and platform table that had no migration', async () => {
    const { sql } = await runUp(['users']);

    for (const table of TABLES) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS "${table}"`);
    }
  });

  it('creates the enum types the otp and data request columns need', async () => {
    const { sql } = await runUp(['users']);

    expect(sql).toContain('CREATE TYPE "public"."otps_type_enum"');
    expect(sql).toContain('CREATE TYPE "public"."data_requests_type_enum"');
    expect(sql).toContain('CREATE TYPE "public"."data_requests_status_enum"');
    expect(sql).toContain("'LOGIN', 'PASSWORD_RESET', 'SIGNUP'");
  });

  it('ensures uuid_generate_v4 is available', async () => {
    const { sql } = await runUp(['users']);
    expect(sql).toContain('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  });

  it('creates the indexes the entities declare', async () => {
    const { sql } = await runUp(['users']);

    expect(sql).toContain('IDX_refresh_tokens_tokenHash');
    expect(sql).toContain('IDX_refresh_tokens_userId_revokedAt');
    expect(sql).toContain('IDX_otps_userId_type');
    expect(sql).toContain('IDX_otps_userId_usedAt');
    expect(sql).toContain('IDX_backup_codes_userId_consumedAt');
    expect(sql).toContain('IDX_idempotency_records_key_userId');
    expect(sql).toContain('IDX_data_requests_userId');
  });

  it('seeds one rate limit row per plan', async () => {
    const { sql } = await runUp(['users']);

    expect(sql).toContain('INSERT INTO "rate_limit_configs"');
    for (const plan of ['FREE', 'BASIC', 'PREMIUM', 'ENTERPRISE']) {
      expect(sql).toContain(`'${plan}'`);
    }
    expect(sql).toContain('ON CONFLICT ("plan") DO NOTHING');
  });

  it('adds the user foreign keys', async () => {
    const { sql } = await runUp(['users']);

    expect(sql).toContain('FK_refresh_tokens_userId');
    expect(sql).toContain('FK_otps_userId');
    expect(sql).toContain('FK_backup_codes_userId');
    expect(sql).toContain('FK_data_requests_userId');
    expect(sql).toContain('ON DELETE CASCADE');
  });

  it('skips tables that already exist instead of failing', async () => {
    const { sql } = await runUp(['users', 'otps', 'refresh_tokens']);

    expect(sql).not.toContain('CREATE TABLE IF NOT EXISTS "otps"');
    expect(sql).not.toContain('CREATE TABLE IF NOT EXISTS "refresh_tokens"');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "backup_codes"');
  });

  it('drops every table on the way down', async () => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql);
      }),
    } as unknown as QueryRunner;

    await new CreateAuthAndPlatformTables20261017002000().down(queryRunner);

    const sql = queries.join('\n');
    for (const table of TABLES) {
      expect(sql).toContain(`DROP TABLE IF EXISTS "${table}"`);
    }
  });
});