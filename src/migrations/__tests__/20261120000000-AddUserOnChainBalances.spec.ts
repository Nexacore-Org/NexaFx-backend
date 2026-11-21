import { QueryRunner } from 'typeorm';
import { AddUserOnChainBalances20261120000000 } from '../20261120000000-AddUserOnChainBalances';

describe('AddUserOnChainBalances migration', () => {
  const run = async (hasUsers = true, direction: 'up' | 'down' = 'up') => {
    const queries: string[] = [];
    const queryRunner = {
      hasTable: jest.fn().mockResolvedValue(hasUsers),
      query: jest.fn(async (sql: string) => {
        queries.push(sql);
      }),
    } as unknown as QueryRunner;

    await new AddUserOnChainBalances20261120000000()[direction](queryRunner);

    return queries.join('\n');
  };

  it('adds the snapshot column idempotently as jsonb', async () => {
    const sql = await run();

    expect(sql).toContain(
      'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "onChainBalances" jsonb',
    );
  });

  it('backfills the snapshot from balances and never rewrites balances', async () => {
    const sql = await run();

    expect(sql).toContain('SET "onChainBalances" = COALESCE("balances"');
    expect(sql).not.toMatch(/SET\s+"balances"/);
  });

  it('only backfills rows that still hold the empty default', async () => {
    const sql = await run();

    expect(sql).toContain(`"onChainBalances" = '{}'::jsonb`);
    expect(sql.indexOf('ADD COLUMN')).toBeLessThan(sql.indexOf('UPDATE'));
  });

  it('is a no-op when the users table is absent', async () => {
    const sql = await run(false);

    expect(sql).not.toContain('ALTER TABLE "users"');
  });

  it('drops the column on the way down', async () => {
    const sql = await run(true, 'down');

    expect(sql).toContain(
      'ALTER TABLE "users" DROP COLUMN IF EXISTS "onChainBalances"',
    );
  });
});
