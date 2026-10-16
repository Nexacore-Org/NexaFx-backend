import { QueryRunner } from 'typeorm';
import { FixFeeConfigEnumsAndDefaults20261015000000 } from './20261015000000-FixFeeConfigEnumsAndDefaults';

describe('FixFeeConfigEnumsAndDefaults migration', () => {
  it('replaces unsupported legacy values with entity-backed enums and valid rules', async () => {
    const queries: string[] = [];
    const queryRunner = {
      hasTable: jest.fn().mockResolvedValue(true),
      query: jest.fn(async (sql: string) => {
        queries.push(sql);
      }),
    } as unknown as QueryRunner;

    await new FixFeeConfigEnumsAndDefaults20261015000000().up(queryRunner);

    const migrationSql = queries.join('\n');
    expect(migrationSql).toContain(
      "CREATE TYPE \"fee_configs_transactiontype_enum\" AS ENUM",
    );
    expect(migrationSql).toContain(
      "'DEPOSIT', 'WITHDRAW', 'CONVERT', 'SWAP'",
    );
    expect(migrationSql).toContain(
      "CREATE TYPE \"fee_configs_feetype_enum\" AS ENUM",
    );
    expect(migrationSql).toContain("'FLAT', 'PERCENTAGE'");
    expect(migrationSql).toContain(
      `WHERE "transactionType" NOT IN ('DEPOSIT', 'WITHDRAW', 'CONVERT', 'SWAP')`,
    );
    expect(migrationSql).toContain(
      `WHERE "transactionType" = 'SWAP' AND "currency" = '*'`,
    );
    expect(queries).toHaveLength(11);
  });
});
