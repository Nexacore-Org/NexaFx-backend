import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddKycReviewFields1762000000000 implements MigrationInterface {
  name = 'AddKycReviewFields1762000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the old status type if it exists, then recreate with new values
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'kyc_records_status_enum'
        ) THEN
          ALTER TYPE "public"."kyc_records_status_enum" RENAME TO "kyc_records_status_enum_old";
          
          CREATE TYPE "public"."kyc_records_status_enum" AS ENUM (
            'pending',
            'approved',
            'rejected',
            'resubmission_required'
          );
          
          -- Migrate existing UNDER_REVIEW records to PENDING
          ALTER TABLE "kyc_records"
            ALTER COLUMN "status" TYPE "public"."kyc_records_status_enum"
            USING (
              CASE
                WHEN "status"::text = 'under_review' THEN 'pending'::text::"public"."kyc_records_status_enum"
                ELSE "status"::text::"public"."kyc_records_status_enum"
              END
            );
          
          DROP TYPE "public"."kyc_records_status_enum_old";
        END IF;
      END $$;
    `);

    // Add reviewedBy column if kyc_records table exists
    if (await queryRunner.hasTable('kyc_records')) {
      // Add reviewedBy column (FK to users)
      await queryRunner.query(`
        ALTER TABLE "kyc_records"
        ADD COLUMN IF NOT EXISTS "reviewedBy" uuid
      `);

      // Add FK constraint
      await queryRunner.query(`
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'FK_kyc_records_reviewedBy'
          ) THEN
            ALTER TABLE "kyc_records"
            ADD CONSTRAINT "FK_kyc_records_reviewedBy"
            FOREIGN KEY ("reviewedBy") REFERENCES "users"("id") ON DELETE SET NULL;
          END IF;
        END $$;
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert: Add back UNDER_REVIEW to enum
    if (await queryRunner.hasTable('kyc_records')) {
      await queryRunner.query(`
        ALTER TYPE "public"."kyc_records_status_enum" RENAME TO "kyc_records_status_enum_new";
        
        CREATE TYPE "public"."kyc_records_status_enum" AS ENUM (
          'pending',
          'under_review',
          'approved',
          'rejected'
        );
        
        ALTER TABLE "kyc_records"
          ALTER COLUMN "status" TYPE "public"."kyc_records_status_enum"
          USING "status"::text::"public"."kyc_records_status_enum";
        
        DROP TYPE "public"."kyc_records_status_enum_new";
      `);

      // Remove FK and column
      await queryRunner.query(`
        ALTER TABLE "kyc_records" DROP CONSTRAINT IF EXISTS "FK_kyc_records_reviewedBy"
      `);
      await queryRunner.query(`
        ALTER TABLE "kyc_records" DROP COLUMN IF EXISTS "reviewedBy"
      `);
    }
  }
}
