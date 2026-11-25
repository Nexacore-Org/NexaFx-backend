import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * users.balances is the custodial ledger balance. The periodic Stellar sync
 * used to overwrite it wholesale with the live on-chain balances, erasing
 * internal credits (deposit confirmations, swap proceeds) and ignoring
 * non-default wallets (#1454).
 *
 * The on-chain snapshot now lives in its own column. Existing rows are
 * backfilled from users.balances: for users the old sync already touched,
 * that value IS the last on-chain snapshot. users.balances itself is left
 * untouched.
 */
export class AddUserOnChainBalances20261120000000 implements MigrationInterface {
  name = 'AddUserOnChainBalances20261120000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('users'))) {
      return;
    }

    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "onChainBalances" jsonb DEFAULT '{}'::jsonb`,
    );

    // Only rows still holding the empty default are backfilled, so running
    // this again can never overwrite a snapshot the sync has since written.
    await queryRunner.query(
      `UPDATE "users"
          SET "onChainBalances" = COALESCE("balances", '{}'::jsonb)
        WHERE "onChainBalances" IS NULL OR "onChainBalances" = '{}'::jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('users'))) {
      return;
    }

    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "onChainBalances"`,
    );
  }
}
