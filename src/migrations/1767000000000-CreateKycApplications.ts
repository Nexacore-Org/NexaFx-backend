import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateKycApplications1767000000000 implements MigrationInterface {
  name = 'CreateKycApplications1767000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
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
      `ALTER TABLE "users" ALTER COLUMN "kycTier" TYPE "public"."users_kyctier_enum" USING "kycTier"::text::"public"."users_kyctier_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "kycTier" SET DEFAULT 'NONE'`,
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
    await queryRunner.query(
      `CREATE TYPE "public"."kyc_applications_status_enum" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'RESUBMISSION_REQUIRED')`,
    );

    // 4. Create kyc_applications table
    await queryRunner.query(`
      CREATE TABLE "kyc_applications" (
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
      `ALTER TABLE "users" ALTER COLUMN "kycTier" TYPE "public"."users_kyctier_enum" USING "kycTier"::text::"public"."users_kyctier_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "kycTier" SET DEFAULT 'UNVERIFIED'`,
    );
    await queryRunner.query(`DROP TYPE "public"."users_kyctier_enum_old"`);
  }
}
