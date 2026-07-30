import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddConfidenceScoreToTransactions1768000000000
  implements MigrationInterface
{
  name = 'AddConfidenceScoreToTransactions1768000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "transactions"
      ADD COLUMN "confidenceScore" integer,
      ADD COLUMN "expectedCompletionSeconds" integer,
      ADD COLUMN "confidenceLabel" character varying(20)
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_transactions_confidenceScore"
      ON "transactions" ("confidenceScore")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_transactions_confidenceScore"`,
    );
    await queryRunner.query(`
      ALTER TABLE "transactions"
      DROP COLUMN "confidenceLabel",
      DROP COLUMN "expectedCompletionSeconds",
      DROP COLUMN "confidenceScore"
    `);
  }
}
