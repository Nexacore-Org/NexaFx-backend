import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddKycTierAndTransactionLimits1761000000000 implements MigrationInterface {
  name = 'AddKycTierAndTransactionLimits1761000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."users_kyctier_enum" AS ENUM (
        'UNVERIFIED',
        'BASIC',
        'ENHANCED',
        'FULL'
      )
    `);

    if (await queryRunner.hasTable('users')) {
      await queryRunner.query(`
        ALTER TABLE "users"
        ADD COLUMN "kycTier" "public"."users_kyctier_enum" NOT NULL DEFAULT 'UNVERIFIED'
      `);
    }

    await queryRunner.query(`
      CREATE TABLE "transaction_limits" (
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

    await queryRunner.query(`
      INSERT INTO "transaction_limits" ("tier", "dailyLimitUsd", "monthlyLimitUsd", "singleTxLimitUsd") VALUES
      ('UNVERIFIED', 100, 1000, 100),
      ('BASIC', 1000, 15000, 1000),
      ('ENHANCED', 10000, 150000, 10000),
      ('FULL', 50000, 500000, 50000)
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
