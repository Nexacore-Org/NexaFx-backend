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
    { table: 'users', name: 'idx_users_email', columns: '"email"' },
    { table: 'users', name: 'idx_users_phone', columns: '"phone"' },
    {
      table: 'users',
      name: 'idx_users_referral_code',
      columns: '"referralCode"',
    },
    {
      table: 'transactions',
      name: 'idx_transactions_user_id',
      columns: '"userId"',
    },
    {
      table: 'transactions',
      name: 'idx_transactions_status',
      columns: '"status"',
    },
    { table: 'wallets', name: 'idx_wallets_user_id', columns: '"userId"' },
    {
      table: 'audit_logs',
      name: 'idx_audit_logs_user_id',
      columns: '"userId"',
    },
    { table: 'kyc_records', name: 'idx_kyc_user_id', columns: '"userId"' },
    { table: 'otps', name: 'idx_otps_user_id', columns: '"userId"' },
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
