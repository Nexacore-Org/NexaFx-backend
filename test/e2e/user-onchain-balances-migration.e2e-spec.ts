import { DataSource, QueryRunner } from 'typeorm';
import { AddUserOnChainBalances20261120000000 } from '../../src/migrations/20261120000000-AddUserOnChainBalances';

/**
 * Runs the #1454 migration against real Postgres in an isolated schema with
 * a minimal users table, so it does not depend on the rest of the migration
 * history.
 */
const SCHEMA = 'onchain_balances_migration_e2e';

describe('AddUserOnChainBalances migration (e2e, real Postgres)', () => {
  let dataSource: DataSource;
  let queryRunner: QueryRunner;
  const migration = new AddUserOnChainBalances20261120000000();

  beforeAll(async () => {
    const admin = new DataSource({
      type: 'postgres',
      url: process.env.DATABASE_URL,
    });
    await admin.initialize();
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await admin.query(`CREATE SCHEMA ${SCHEMA}`);
    await admin.destroy();

    dataSource = new DataSource({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      extra: { options: `-c search_path=${SCHEMA}` },
    });
    await dataSource.initialize();
    queryRunner = dataSource.createQueryRunner();
  });

  afterAll(async () => {
    await queryRunner?.release();
    await dataSource.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await dataSource.query('DROP TABLE IF EXISTS users');
    await dataSource.query(
      `CREATE TABLE users (
         id serial PRIMARY KEY,
         balances jsonb DEFAULT '{}'::jsonb
       )`,
    );
    await dataSource.query(
      `INSERT INTO users (balances) VALUES
         ('{"XLM": 12.5, "USD": 3}'::jsonb),
         ('{}'::jsonb),
         (NULL)`,
    );
  });

  const rows = () =>
    dataSource.query(
      'SELECT id, balances, "onChainBalances" FROM users ORDER BY id',
    );

  it('adds the column and backfills it from balances without changing balances', async () => {
    await migration.up(queryRunner);

    const result = await rows();
    expect(result[0].onChainBalances).toEqual({ XLM: 12.5, USD: 3 });
    expect(result[1].onChainBalances).toEqual({});
    expect(result[2].onChainBalances).toEqual({});
    // The ledger column is exactly as it was.
    expect(result[0].balances).toEqual({ XLM: 12.5, USD: 3 });
    expect(result[1].balances).toEqual({});
    expect(result[2].balances).toBeNull();
  });

  it('can run twice without overwriting a snapshot the sync has since written', async () => {
    await migration.up(queryRunner);
    await dataSource.query(
      `UPDATE users SET "onChainBalances" = '{"XLM": 99}'::jsonb WHERE id = 1`,
    );

    await migration.up(queryRunner);

    const result = await rows();
    expect(result[0].onChainBalances).toEqual({ XLM: 99 });
    expect(result[0].balances).toEqual({ XLM: 12.5, USD: 3 });
  });

  it('drops the column on the way down and can be applied again', async () => {
    await migration.up(queryRunner);
    await migration.down(queryRunner);

    const cols = await dataSource.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'users'`,
      [SCHEMA],
    );
    expect(cols.map((c: { column_name: string }) => c.column_name)).toEqual(
      expect.not.arrayContaining(['onChainBalances']),
    );

    await migration.up(queryRunner);
    expect((await rows())[0].onChainBalances).toEqual({ XLM: 12.5, USD: 3 });
  });
});
