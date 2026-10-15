import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWalletArchive1792091461752 implements MigrationInterface {
  name = 'AddWalletArchive1792091461752';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "wallets"
      ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP WITH TIME ZONE
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_wallets_user_currency"
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_wallets_user_currency"
      ON "wallets" ("userId", "currency")
      WHERE "currency" <> 'XLM' AND "archivedAt" IS NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_wallets_user_currency"
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_wallets_user_currency"
      ON "wallets" ("userId", "currency")
      WHERE "currency" <> 'XLM'
    `);
    await queryRunner.query(`
      ALTER TABLE "wallets"
      DROP COLUMN IF EXISTS "archivedAt"
    `);
  }
}
