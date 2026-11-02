import { QueryRunner } from 'typeorm';
import { AddKycPendingUniqueIndex20261018000000 } from './20261018000000-AddKycPendingUniqueIndex';

describe('AddKycPendingUniqueIndex20261018000000 migration', () => {
  const run = async (
    hasTable = true,
    direction: 'up' | 'down' = 'up',
  ): Promise<string> => {
    const queries: string[] = [];
    const queryRunner = {
      hasTable: jest.fn().mockResolvedValue(hasTable),
      query: jest.fn(async (sql: string) => {
        queries.push(sql);
      }),
    } as unknown as QueryRunner;

    await new AddKycPendingUniqueIndex20261018000000()[direction](queryRunner);
    return queries.join('\n');
  };

  it('creates partial unique index on kyc_applications(userId) WHERE status = PENDING', async () => {
    const sql = await run(true, 'up');

    expect(sql).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "UQ_kyc_applications_user_pending"',
    );
    expect(sql).toContain('ON "kyc_applications" ("userId")');
    expect(sql).toContain(`WHERE "status" = 'PENDING'`);
  });

  it('drops the partial unique index on down', async () => {
    const sql = await run(true, 'down');

    expect(sql).toContain(
      'DROP INDEX IF EXISTS "UQ_kyc_applications_user_pending"',
    );
  });

  it('is a no-op when kyc_applications table is absent', async () => {
    const upSql = await run(false, 'up');
    const downSql = await run(false, 'down');

    expect(upSql).toBe('');
    expect(downSql).toBe('');
  });
});
