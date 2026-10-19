import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the kycTier column to users and creates the transaction_limits table.
 *
 * IDEMPOTENCY NOTES:
 * - `users.kycTier` and its enum already exist when CreateUsersTable ran first,
 *   so both the type and the column are created guardedly.
 * - The data source runs migrations with `migrationsTransactionMode: 'each'`,
 *   so every statement below is applied atomically without the migration
 *   opening a transaction of its own (which would fight the runner).
 */
export class AddKycTierAndTransactionLimits1761000000000 implements MigrationInterface {
  name = 'AddKycTierAndTransactionLimits1761000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // CreateUsersTable already created this enum for `users.kycTier`.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'users_kyctier_enum'
        ) THEN
          CREATE TYPE "public"."users_kyctier_enum" AS ENUM (
            'UNVERIFIED',
            'BASIC',
            'ENHANCED',
            'FULL'
          );
        END IF;
      END
      $$;
    `);

    if (await queryRunner.hasTable('users')) {
      await queryRunner.query(`
        ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "kycTier" "public"."users_kyctier_enum" NOT NULL DEFAULT 'UNVERIFIED'
      `);
    }

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "transaction_limits" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tier" "public"."users_kyctier_enum" NOT NULL,
        "dailyLimitUsd" numeric(20,8) NOT NULL,
        "monthlyLimitUsd" numeric(20,8) NOT NULL,
        "singleTxLimitUsd" numeric(20,8) NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_transaction_limits_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_transaction_limits_tier" UNIQUE ("tier")
      )
    `);

    // Seed initial tier limits; ON CONFLICT keeps a re-run from duplicating rows.
    await queryRunner.query(`
      INSERT INTO "transaction_limits" ("tier", "dailyLimitUsd", "monthlyLimitUsd", "singleTxLimitUsd") VALUES
        ('UNVERIFIED', 100, 1000, 100),
        ('BASIC', 1000, 15000, 1000),
        ('ENHANCED', 10000, 150000, 10000),
        ('FULL', 50000, 500000, 50000)
      ON CONFLICT ("tier") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "transaction_limits"');

    if (await queryRunner.hasTable('users')) {
      await queryRunner.query(
        'ALTER TABLE "users" DROP COLUMN IF EXISTS "kycTier"',
      );
    }

    await queryRunner.query(
      'DROP TYPE IF EXISTS "public"."users_kyctier_enum"',
    );
  }
}
