import { MigrationInterface, QueryRunner } from 'typeorm';

interface IndexDefinition {
  table: string;
  name: string;
  columns: string;
}

export class AddMissingIndexes1715421500000 implements MigrationInterface {
  name = 'AddMissingIndexes1715421500000';

  /**
   * `CREATE INDEX CONCURRENTLY` cannot run inside a transaction block, so this
   * migration must not be wrapped in one. The data source configures
   * `migrationsTransactionMode: 'each'`, which honours this flag.
   */
  transaction = false;

  /**
   * Indexes owned by this migration.
   *
   * Pointed at `kyc_records` (the entity table) instead of the `kyc` table,
   * which never existed in any entity or migration.
   */
  readonly indexes: ReadonlyArray<IndexDefinition> = [
    { table: 'users', name: 'IDX_97672ac88f789774dd47f7c8be', columns: '"email"' },
    { table: 'users', name: 'IDX_a000cca60bcf04454e72769949', columns: '"phone"' },
    {
      table: 'users',
      name: 'IDX_b7f8278f4e89249bb75c9a1589',
      columns: '"referralCode"',
    },
    {
      table: 'transactions',
      name: 'IDX_6bb58f2b6e30cb51a6504599f4',
      columns: '"userId"',
    },
    {
      table: 'transactions',
      name: 'IDX_da87c55b3bbbe96c6ed88ea7ee',
      columns: '"status"',
    },
    { table: 'wallets', name: 'IDX_2ecdb33f23e9a6fc392025c0b9', columns: '"userId"' },
    {
      table: 'audit_logs',
      name: 'IDX_cfa83f61e4d27a87fcae1e025a',
      columns: '"userId"',
    },
    { table: 'kyc_records', name: 'IDX_bb87c5ec834284b29466a9b4d6', columns: '"userId"' },
    { table: 'otps', name: 'IDX_82b0deb105275568cdcef2823e', columns: '"userId"' },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const index of this.indexes) {
      // Some target tables (transactions, wallets, audit_logs, ...) come from
      // migrations that run after this one, so only index what exists instead
      // of failing the entire run.
      if (!(await queryRunner.hasTable(index.table))) {
        continue;
      }

      await queryRunner.query(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${index.name} ON ${index.table} (${index.columns})`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const index of this.indexes) {
      await queryRunner.query(`DROP INDEX IF EXISTS ${index.name}`);
    }
  }
}
