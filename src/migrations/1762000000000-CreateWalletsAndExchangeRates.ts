import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWalletsAndExchangeRates1762000000000
  implements MigrationInterface
{
  name = 'CreateWalletsAndExchangeRates1762000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the old wallets table if it exists to avoid column and constraint mismatches
    await queryRunner.query('DROP TABLE IF EXISTS "wallets"');

    // Create the new wallets table
    await queryRunner.query(`
      CREATE TABLE "wallets" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "currency" character varying(10) NOT NULL DEFAULT 'XLM',
        "balance" numeric(20,8) NOT NULL DEFAULT 0.00000000,
        "publicKey" character varying(56),
        "encryptedSecretKey" text,
        "label" character varying(100) NOT NULL DEFAULT 'Primary',
        "isDefault" boolean NOT NULL DEFAULT false,
        "network" character varying(10) NOT NULL DEFAULT 'TESTNET',
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_wallets_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_wallets_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // Create index on userId for faster queries
    await queryRunner.query(`
      CREATE INDEX "IDX_wallets_userId" ON "wallets" ("userId")
    `);

    // Create partial unique index on (userId, currency) for non-Stellar currencies
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_wallets_user_currency" ON "wallets" ("userId", "currency") WHERE "currency" <> 'XLM'
    `);

    // Create partial unique index on (userId, publicKey) for Stellar wallets
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_wallets_user_publicKey" ON "wallets" ("userId", "publicKey") WHERE "publicKey" IS NOT NULL
    `);

    // Create the exchange_rate_snapshots table for OHLC historical data
    await queryRunner.query(`
      CREATE TABLE "exchange_rate_snapshots" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "from" character varying(10) NOT NULL,
        "to" character varying(10) NOT NULL,
        "rate" numeric(20,8) NOT NULL,
        "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_exchange_rate_snapshots_id" PRIMARY KEY ("id")
      )
    `);

    // Create index on (from, to, timestamp) for history query performance
    await queryRunner.query(`
      CREATE INDEX "IDX_exchange_rate_snapshots_lookup" ON "exchange_rate_snapshots" ("from", "to", "timestamp")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "exchange_rate_snapshots"');
    await queryRunner.query('DROP TABLE IF EXISTS "wallets"');
  }
}
