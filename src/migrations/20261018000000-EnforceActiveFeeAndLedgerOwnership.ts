import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnforceActiveFeeAndLedgerOwnership20261018000000
  implements MigrationInterface
{
  name = 'EnforceActiveFeeAndLedgerOwnership20261018000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('fee_configs')) {
      await queryRunner.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS "IDX_fee_configs_active_transaction_currency"
        ON "fee_configs" ("transactionType", "currency")
        WHERE "isActive" = true
      `);
    }

    if (
      !(await queryRunner.hasTable('ledger_entries')) ||
      !(await queryRunner.hasTable('transactions'))
    ) {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "ledger_entries"
      ADD COLUMN IF NOT EXISTS "userId" uuid
    `);
    await queryRunner.query(`
      UPDATE "ledger_entries" AS entry
      SET "userId" = transaction."userId"
      FROM "transactions" AS transaction
      WHERE entry."transactionId" = transaction."id"
        AND entry."accountType" = 'USER'
        AND entry."userId" IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_ledger_entries_userId"
      ON "ledger_entries" ("userId")
    `);
    await queryRunner.query(`
      DO $$
      DECLARE constraint_name text;
      BEGIN
        FOR constraint_name IN
          SELECT constraint_row.conname
          FROM pg_constraint constraint_row
          JOIN pg_attribute column_row
            ON column_row.attrelid = constraint_row.conrelid
           AND column_row.attnum = ANY(constraint_row.conkey)
          WHERE constraint_row.conrelid = '"ledger_entries"'::regclass
            AND constraint_row.contype = 'f'
            AND constraint_row.confrelid = '"transactions"'::regclass
            AND column_row.attname = 'transactionId'
        LOOP
          EXECUTE format(
            'ALTER TABLE "ledger_entries" DROP CONSTRAINT %I',
            constraint_name
          );
        END LOOP;
      END $$;
    `);
    await queryRunner.query(`
      ALTER TABLE "ledger_entries"
      ADD CONSTRAINT "FK_ledger_entries_transactionId"
      FOREIGN KEY ("transactionId") REFERENCES "transactions"("id")
      ON DELETE RESTRICT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('fee_configs')) {
      await queryRunner.query(`
        DROP INDEX IF EXISTS "IDX_fee_configs_active_transaction_currency"
      `);
    }

    if (
      !(await queryRunner.hasTable('ledger_entries')) ||
      !(await queryRunner.hasTable('transactions'))
    ) {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "ledger_entries"
      DROP CONSTRAINT IF EXISTS "FK_ledger_entries_transactionId"
    `);
    await queryRunner.query(`
      ALTER TABLE "ledger_entries"
      ADD CONSTRAINT "FK_ledger_entries_transactionId"
      FOREIGN KEY ("transactionId") REFERENCES "transactions"("id")
      ON DELETE CASCADE
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_ledger_entries_userId"
    `);
    await queryRunner.query(`
      ALTER TABLE "ledger_entries" DROP COLUMN IF EXISTS "userId"
    `);
  }
}
