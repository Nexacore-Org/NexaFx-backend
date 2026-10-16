import { QueryRunner } from 'typeorm';
import { DropPasswordHash20261017001000 } from './20261017001000-DropPasswordHash';

describe('DropPasswordHash migration', () => {
  const run = async (hasUsers = true, direction: 'up' | 'down' = 'up') => {
    const queries: string[] = [];
    const queryRunner = {
      hasTable: jest.fn().mockResolvedValue(hasUsers),
      query: jest.fn(async (sql: string) => {
        queries.push(sql);
      }),
    } as unknown as QueryRunner;

    await new DropPasswordHash20261017001000()[direction](queryRunner);

    return queries.join('\n');
  };

  it('drops the duplicated passwordHash column', async () => {
    const sql = await run();

    expect(sql).toContain(
      'ALTER TABLE "users" DROP COLUMN IF EXISTS "passwordHash"',
    );
  });

  it('makes password nullable so OAuth-only users can be created', async () => {
    const sql = await run();

    expect(sql).toContain(
      'ALTER TABLE "users" ALTER COLUMN "password" DROP NOT NULL',
    );
  });

  it('is a no-op when the users table is absent', async () => {
    const sql = await run(false);

    expect(sql).not.toContain('ALTER TABLE "users"');
  });

  it('restores both columns on the way down', async () => {
    const sql = await run(true, 'down');

    expect(sql).toContain(
      'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "passwordHash"',
    );
    expect(sql).toContain(
      'ALTER TABLE "users" ALTER COLUMN "password" SET NOT NULL',
    );
    // Existing hashes are copied back before the NOT NULL is reinstated.
    expect(sql).toContain(
      'UPDATE "users" SET "passwordHash" = "password" WHERE "passwordHash" IS NULL',
    );
    expect(
      sql.indexOf('SET "passwordHash" = "password"'),
    ).toBeLessThan(sql.indexOf('ALTER COLUMN "password" SET NOT NULL'));
  });
});