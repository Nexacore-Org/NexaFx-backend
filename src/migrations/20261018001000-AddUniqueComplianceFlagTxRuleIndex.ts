import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUniqueComplianceFlagTxRuleIndex20261018001000 implements MigrationInterface {
  name = 'AddUniqueComplianceFlagTxRuleIndex20261018001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('compliance_flags'))) {
      return;
    }

    // Remove any pre-existing duplicate (transactionId, rule) rows, keeping the earliest flag
    await queryRunner.query(`
      DELETE FROM "compliance_flags" a
      USING "compliance_flags" b
      WHERE a."transactionId" IS NOT NULL
        AND a."transactionId" = b."transactionId"
        AND a."rule" = b."rule"
        AND (
          a."createdAt" > b."createdAt"
          OR (a."createdAt" = b."createdAt" AND a."id" > b."id")
        )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_compliance_flags_transactionId_rule"
      ON "compliance_flags" ("transactionId", "rule")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('compliance_flags'))) {
      return;
    }

    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_compliance_flags_transactionId_rule"
    `);
  }
}
