import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStellarFieldsToWallet1765000000000 implements MigrationInterface {
  name = 'AddStellarFieldsToWallet1765000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "transactions"
      ADD COLUMN IF NOT EXISTS "stellarTxHash" character varying(255)
    `);

    await queryRunner.query(`
      UPDATE "transactions"
      SET "stellarTxHash" = "txHash"
      WHERE "stellarTxHash" IS NULL AND "txHash" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "transactions"
      DROP COLUMN IF EXISTS "stellarTxHash"
    `);
  }
}
