import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateTransactionLimitsSchema1763000000000
  implements MigrationInterface
{
  name = 'UpdateTransactionLimitsSchema1763000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add new columns if they don't exist
    const hasTransactionType = await queryRunner.hasColumn(
      'transaction_limits',
      'transactionType',
    );
    if (!hasTransactionType) {
      await queryRunner.query(
        `ALTER TABLE "transaction_limits" ADD COLUMN "transactionType" character varying(50) NOT NULL DEFAULT 'SEND'`,
      );
    }

    const hasCurrency = await queryRunner.hasColumn(
      'transaction_limits',
      'currency',
    );
    if (!hasCurrency) {
      await queryRunner.query(
        `ALTER TABLE "transaction_limits" ADD COLUMN "currency" character varying(10) NOT NULL DEFAULT 'USD'`,
      );
    }

    const hasIsActive = await queryRunner.hasColumn(
      'transaction_limits',
      'isActive',
    );
    if (!hasIsActive) {
      await queryRunner.query(
        `ALTER TABLE "transaction_limits" ADD COLUMN "isActive" boolean NOT NULL DEFAULT true`,
      );
    }

    // Rename columns to match new schema
    const hasSingleTxLimitUsd = await queryRunner.hasColumn(
      'transaction_limits',
      'singleTxLimitUsd',
    );
    if (hasSingleTxLimitUsd) {
      await queryRunner.query(
        `ALTER TABLE "transaction_limits" RENAME COLUMN "singleTxLimitUsd" TO "singleTransactionMax"`,
      );
    }

    const hasDailyLimitUsd = await queryRunner.hasColumn(
      'transaction_limits',
      'dailyLimitUsd',
    );
    if (hasDailyLimitUsd) {
      await queryRunner.query(
        `ALTER TABLE "transaction_limits" RENAME COLUMN "dailyLimitUsd" TO "dailyMax"`,
      );
    }

    const hasMonthlyLimitUsd = await queryRunner.hasColumn(
      'transaction_limits',
      'monthlyLimitUsd',
    );
    if (hasMonthlyLimitUsd) {
      await queryRunner.query(
        `ALTER TABLE "transaction_limits" RENAME COLUMN "monthlyLimitUsd" TO "monthlyMax"`,
      );
    }

    // Drop old unique constraint on tier
    await queryRunner.query(
      `ALTER TABLE "transaction_limits" DROP CONSTRAINT IF EXISTS "UQ_transaction_limits_tier"`,
    );

    // Add new composite unique constraint
    await queryRunner.query(
      `ALTER TABLE "transaction_limits" ADD CONSTRAINT "UQ_transaction_limits_tier_type_currency" 
       UNIQUE ("tier", "transactionType", "currency")`,
    );

    // Clear existing data and seed new structure
    await queryRunner.query(`DELETE FROM "transaction_limits"`);

    // Seed limits per KYC tier, transaction type, and USD currency
    // UNVERIFIED: single 0, daily 0, monthly 0
    const unverifiedLimits = [
      { tier: 'UNVERIFIED', type: 'SEND', single: 0, daily: 0, monthly: 0 },
      { tier: 'UNVERIFIED', type: 'WITHDRAW', single: 0, daily: 0, monthly: 0 },
      { tier: 'UNVERIFIED', type: 'SWAP', single: 0, daily: 0, monthly: 0 },
    ];

    // BASIC: single 500, daily 5000, monthly 50000
    const basicLimits = [
      { tier: 'BASIC', type: 'SEND', single: 500, daily: 5000, monthly: 50000 },
      { tier: 'BASIC', type: 'WITHDRAW', single: 500, daily: 5000, monthly: 50000 },
      { tier: 'BASIC', type: 'SWAP', single: 500, daily: 5000, monthly: 50000 },
    ];

    // ENHANCED: single 50000, daily 50000, monthly 500000
    const enhancedLimits = [
      { tier: 'ENHANCED', type: 'SEND', single: 50000, daily: 50000, monthly: 500000 },
      { tier: 'ENHANCED', type: 'WITHDRAW', single: 50000, daily: 50000, monthly: 500000 },
      { tier: 'ENHANCED', type: 'SWAP', single: 50000, daily: 50000, monthly: 500000 },
    ];

    // FULL: single 10000, daily 50000, monthly 500000
    const fullLimits = [
      { tier: 'FULL', type: 'SEND', single: 10000, daily: 50000, monthly: 500000 },
      { tier: 'FULL', type: 'WITHDRAW', single: 10000, daily: 50000, monthly: 500000 },
      { tier: 'FULL', type: 'SWAP', single: 10000, daily: 50000, monthly: 500000 },
    ];

    const allLimits = [...unverifiedLimits, ...basicLimits, ...enhancedLimits, ...fullLimits];

    for (const limit of allLimits) {
      await queryRunner.query(
        `INSERT INTO "transaction_limits" ("tier", "transactionType", "currency", "singleTransactionMax", "dailyMax", "monthlyMax", "isActive")
         VALUES ($1, $2, $3, $4, $5, $6, true)`,
        [limit.tier, limit.type, 'USD', limit.single, limit.daily, limit.monthly],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert column names
    await queryRunner.query(
      `ALTER TABLE "transaction_limits" RENAME COLUMN "singleTransactionMax" TO "singleTxLimitUsd"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_limits" RENAME COLUMN "dailyMax" TO "dailyLimitUsd"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_limits" RENAME COLUMN "monthlyMax" TO "monthlyLimitUsd"`,
    );

    // Drop new constraint
    await queryRunner.query(
      `ALTER TABLE "transaction_limits" DROP CONSTRAINT IF EXISTS "UQ_transaction_limits_tier_type_currency"`,
    );

    // Add back old constraint
    await queryRunner.query(
      `ALTER TABLE "transaction_limits" ADD CONSTRAINT "UQ_transaction_limits_tier" UNIQUE ("tier")`,
    );

    // Drop new columns
    await queryRunner.query(
      `ALTER TABLE "transaction_limits" DROP COLUMN IF EXISTS "transactionType"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_limits" DROP COLUMN IF EXISTS "currency"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_limits" DROP COLUMN IF EXISTS "isActive"`,
    );
  }
}

