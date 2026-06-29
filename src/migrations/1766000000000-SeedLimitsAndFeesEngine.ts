import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeedLimitsAndFeesEngine1766000000000 implements MigrationInterface {
  name = 'SeedLimitsAndFeesEngine1766000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Ensure fee_configs table exists if not already present
    const feeConfigsExists = await queryRunner.hasTable('fee_configs');
    if (!feeConfigsExists) {
      await queryRunner.query(`
        CREATE TABLE "fee_configs" (
          "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
          "transactionType" varchar(50) NOT NULL,
          "feeType" varchar(20) NOT NULL DEFAULT 'PERCENT',
          "feeValue" numeric(20,8) NOT NULL DEFAULT 0,
          "minFee" numeric(20,8),
          "maxFee" numeric(20,8),
          "currency" varchar(10) NOT NULL DEFAULT 'USD',
          "isActive" boolean NOT NULL DEFAULT true,
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          CONSTRAINT "PK_fee_configs_id" PRIMARY KEY ("id")
        )
      `);
    }

    // 2. Ensure transaction_limits table has required columns or insert seeds
    const limitsExists = await queryRunner.hasTable('transaction_limits');
    if (!limitsExists) {
      await queryRunner.query(`
        CREATE TABLE "transaction_limits" (
          "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
          "kycTier" varchar(50) NOT NULL,
          "transactionType" varchar(50),
          "singleTransactionMax" numeric(20,8) NOT NULL DEFAULT 0,
          "dailyMax" numeric(20,8) NOT NULL DEFAULT 0,
          "monthlyMax" numeric(20,8) NOT NULL DEFAULT 0,
          "currency" varchar(10) NOT NULL DEFAULT 'USD',
          "isActive" boolean NOT NULL DEFAULT true,
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          CONSTRAINT "PK_transaction_limits_id" PRIMARY KEY ("id")
        )
      `);
    } else {
      // Add columns if missing
      await queryRunner.query(`
        ALTER TABLE "transaction_limits"
        ADD COLUMN IF NOT EXISTS "kycTier" varchar(50),
        ADD COLUMN IF NOT EXISTS "transactionType" varchar(50),
        ADD COLUMN IF NOT EXISTS "singleTransactionMax" numeric(20,8) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "dailyMax" numeric(20,8) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "monthlyMax" numeric(20,8) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "currency" varchar(10) DEFAULT 'USD',
        ADD COLUMN IF NOT EXISTS "isActive" boolean DEFAULT true
      `);
    }

    // 3. Seed default transaction limits
    await queryRunner.query(`
      INSERT INTO "transaction_limits" ("kycTier", "singleTransactionMax", "dailyMax", "monthlyMax", "currency", "isActive")
      VALUES
        ('UNVERIFIED', 0, 0, 0, 'USD', true),
        ('BASIC', 500, 5000, 50000, 'USD', true),
        ('FULL', 10000, 50000, 500000, 'USD', true)
      ON CONFLICT DO NOTHING
    `);

    // 4. Seed default fee configs
    await queryRunner.query(`
      INSERT INTO "fee_configs" ("transactionType", "feeType", "feeValue", "minFee", "currency", "isActive")
      VALUES
        ('SEND', 'PERCENT', 0.5, 0.10, 'USD', true),
        ('EXCHANGE', 'PERCENT', 0.5, NULL, 'USD', true),
        ('WITHDRAWAL', 'FLAT', 1.00, NULL, 'USD', true)
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "fee_configs" WHERE "transactionType" IN ('SEND', 'EXCHANGE', 'WITHDRAWAL')`);
  }
}
