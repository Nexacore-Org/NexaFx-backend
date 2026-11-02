import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `lastAutoDepositAt` to `savings_vaults` so scheduled auto-deposit runs
 * are idempotent across retries, restarts, and multiple worker instances on the
 * same UTC day.
 */
export class AddLastAutoDepositAtToSavingsVaults20261018000000
  implements MigrationInterface
{
  name = 'AddLastAutoDepositAtToSavingsVaults20261018000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('savings_vaults'))) {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "savings_vaults"
        ADD COLUMN IF NOT EXISTS "lastAutoDepositAt" TIMESTAMP WITH TIME ZONE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('savings_vaults'))) {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "savings_vaults"
        DROP COLUMN IF EXISTS "lastAutoDepositAt"
    `);
  }
}
