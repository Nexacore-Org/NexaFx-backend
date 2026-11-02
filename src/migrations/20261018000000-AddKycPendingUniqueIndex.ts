import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Prevents duplicate pending KYC applications for the same user by adding a
 * partial unique index on `kyc_applications("userId") WHERE "status" = 'PENDING'`.
 */
export class AddKycPendingUniqueIndex20261018000000
  implements MigrationInterface
{
  name = 'AddKycPendingUniqueIndex20261018000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('kyc_applications'))) {
      return;
    }

    // Resolve any pre-existing duplicate PENDING applications per user before
    // creating the partial unique index, keeping only the most recent one.
    await queryRunner.query(`
      WITH ranked_pending AS (
        SELECT
          "id",
          ROW_NUMBER() OVER (
            PARTITION BY "userId"
            ORDER BY "createdAt" DESC, "id" DESC
          ) AS rn
        FROM "kyc_applications"
        WHERE "status" = 'PENDING'
      )
      UPDATE "kyc_applications"
      SET
        "status" = 'REJECTED',
        "rejectionReason" = COALESCE(
          "rejectionReason",
          'Superseded by newer pending KYC submission'
        ),
        "updatedAt" = now()
      WHERE "id" IN (
        SELECT "id" FROM ranked_pending WHERE rn > 1
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_kyc_applications_user_pending"
      ON "kyc_applications" ("userId")
      WHERE "status" = 'PENDING'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('kyc_applications'))) {
      return;
    }

    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_kyc_applications_user_pending"`,
    );
  }
}
