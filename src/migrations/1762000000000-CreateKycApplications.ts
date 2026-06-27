import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateKycApplications1762000000000 implements MigrationInterface {
  name = 'CreateKycApplications1762000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."application_target_tier_enum" AS ENUM (
        'STANDARD',
        'ENHANCED'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."application_status_enum" AS ENUM (
        'PENDING',
        'APPROVED',
        'REJECTED',
        'RESUBMISSION_REQUIRED'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "kyc_applications" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "targetTier" "public"."application_target_tier_enum" NOT NULL,
        "status" "public"."application_status_enum" NOT NULL DEFAULT 'PENDING',
        "documents" jsonb,
        "rejectionReason" text,
        "reviewedBy" uuid,
        "reviewedAt" TIMESTAMP WITH TIME ZONE,
        "submittedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_kyc_applications_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_kyc_applications_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_kyc_applications_reviewedBy" FOREIGN KEY ("reviewedBy") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_kyc_applications_user_status" ON "kyc_applications" ("userId", "status")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_kyc_applications_status" ON "kyc_applications" ("status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_kyc_applications_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_kyc_applications_user_status"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "kyc_applications"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."application_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."application_target_tier_enum"`);
  }
}
