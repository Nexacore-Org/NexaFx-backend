import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Records when a late penalty was last applied to an instalment. Without it a
 * second cron run on the same day applied the penalty again.
 */
export class AddLastPenaltyAppliedAt1785000000200
  implements MigrationInterface
{
  name = 'AddLastPenaltyAppliedAt1785000000200';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "loan_repayments"
        ADD COLUMN IF NOT EXISTS "lastPenaltyAppliedAt" TIMESTAMP WITH TIME ZONE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "loan_repayments" DROP COLUMN IF EXISTS "lastPenaltyAppliedAt"
    `);
  }
}
