import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Moves KYC tiers to the (NONE, BASIC, STANDARD, ENHANCED) enum and creates
 * kyc_applications.
 *
 * The tier rename must also convert `transaction_limits.tier`, otherwise the
 * old enum cannot be dropped (`cannot drop type ... because other objects
 * depend on it`).
 */
export class CreateKycApplications1767000000000 implements MigrationInterface {
  name = 'CreateKycApplications1767000000000';

  /**
   * Old tier labels -> new tier labels for the given column. The limits seeded
   * by AddKycTierAndTransactionLimits map onto these names.
   */
  private static oldToNew(column: string): string {
    return `(
      CASE "${column}"::text
        WHEN 'UNVERIFIED' THEN 'NONE'
        WHEN 'ENHANCED' THEN 'STANDARD'
        WHEN 'FULL' THEN 'ENHANCED'
        ELSE "${column}"::text
      END
    )::"public"."users_kyctier_enum"`;
  }

  /** New tier labels -> old tier labels for the given column. */
  private static newToOld(column: string): string {
    return `(
      CASE "${column}"::text
        WHEN 'NONE' THEN 'UNVERIFIED'
        WHEN 'STANDARD' THEN 'ENHANCED'
        WHEN 'ENHANCED' THEN 'FULL'
        ELSE "${column}"::text
      END
    )::"public"."users_kyctier_enum"`;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const oldToNew = CreateKycApplications1767000000000.oldToNew;

    // 1. Update UserKycTier enum to NONE, BASIC, STANDARD, ENHANCED
    await queryRunner.query(
      `ALTER TYPE "public"."users_kyctier_enum" RENAME TO "users_kyctier_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."users_kyctier_enum" AS ENUM('NONE', 'BASIC', 'STANDARD', 'ENHANCED')`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "kycTier" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "kycTier" TYPE "public"."users_kyctier_enum" USING (${oldToNew('kycTier')})`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "kycTier" SET DEFAULT 'NONE'`,
    );

    // transaction_limits.tier still references the old enum; convert it before
    // the old type is dropped.
    await queryRunner.query(
      `ALTER TABLE "transaction_limits" ALTER COLUMN "tier" TYPE "public"."users_kyctier_enum" USING (${oldToNew('tier')})`,
    );

    await queryRunner.query(`DROP TYPE "public"."users_kyctier_enum_old"`);

    // 2. Update transaction_limits to use the new tiers
    // Delete old limits and insert new ones with correct tier mapping
    await queryRunner.query(`DELETE FROM "transaction_limits"`);

    await queryRunner.query(`
      INSERT INTO "transaction_limits" ("tier", "dailyLimitUsd", "monthlyLimitUsd", "singleTxLimitUsd") VALUES
      ('NONE', 100, 1000, 100),
      ('BASIC', 1000, 15000, 1000),
      ('STANDARD', 10000, 150000, 10000),
      ('ENHANCED', 50000, 500000, 50000)
    `);

    // 3. Create kyc_applications_status_enum
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'kyc_applications_status_enum'
        ) THEN
          CREATE TYPE "public"."kyc_applications_status_enum" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'RESUBMISSION_REQUIRED');
        END IF;
      END
      $$;
    `);

    // 4. Create kyc_applications table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "kyc_applications" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "targetTier" "public"."users_kyctier_enum" NOT NULL,
        "status" "public"."kyc_applications_status_enum" NOT NULL DEFAULT 'PENDING',
        "documents" jsonb NOT NULL DEFAULT '{}',
        "rejectionReason" character varying,
        "reviewedBy" uuid,
        "reviewedAt" TIMESTAMP WITH TIME ZONE,
        "submittedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_kyc_applications" PRIMARY KEY ("id")
      )
    `);

    // Add foreign keys
    await queryRunner.query(`
      ALTER TABLE "kyc_applications" ADD CONSTRAINT "FK_kyc_applications_userId" 
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "kyc_applications" ADD CONSTRAINT "FK_kyc_applications_reviewedBy" 
      FOREIGN KEY ("reviewedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const newToOld = CreateKycApplications1767000000000.newToOld;

    await queryRunner.query(
      `ALTER TABLE "kyc_applications" DROP CONSTRAINT "FK_kyc_applications_reviewedBy"`,
    );
    await queryRunner.query(
      `ALTER TABLE "kyc_applications" DROP CONSTRAINT "FK_kyc_applications_userId"`,
    );
    await queryRunner.query(`DROP TABLE "kyc_applications"`);
    await queryRunner.query(
      `DROP TYPE "public"."kyc_applications_status_enum"`,
    );

    await queryRunner.query(
      `ALTER TYPE "public"."users_kyctier_enum" RENAME TO "users_kyctier_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."users_kyctier_enum" AS ENUM('UNVERIFIED', 'BASIC', 'ENHANCED', 'FULL')`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "kycTier" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "kycTier" TYPE "public"."users_kyctier_enum" USING (${newToOld('kycTier')})`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "kycTier" SET DEFAULT 'UNVERIFIED'`,
    );

    // Convert transaction_limits.tier back before dropping the renamed type.
    await queryRunner.query(
      `ALTER TABLE "transaction_limits" ALTER COLUMN "tier" TYPE "public"."users_kyctier_enum" USING (${newToOld('tier')})`,
    );

    await queryRunner.query(`DROP TYPE "public"."users_kyctier_enum_old"`);
  }
}
