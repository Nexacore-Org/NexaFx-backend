import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFeeConfigs1762000000000 implements MigrationInterface {
  name = 'CreateFeeConfigs1762000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enums if they don't exist
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."fee_transaction_type_enum" AS ENUM (
          'DEPOSIT',
          'WITHDRAW',
          'CONVERT',
          'SWAP'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."fee_type_enum" AS ENUM (
          'FLAT',
          'PERCENTAGE'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$
    `);

    // Create fee_configs table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "fee_configs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "transactionType" "public"."fee_transaction_type_enum" NOT NULL,
        "currency" character varying(10) NOT NULL,
        "feeType" "public"."fee_type_enum" NOT NULL,
        "feeValue" numeric(20,8) NOT NULL,
        "minFee" numeric(20,8),
        "maxFee" numeric(20,8),
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_fee_configs_id" PRIMARY KEY ("id")
      )
    `);

    // Create fee_records table if it doesn't exist
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "fee_records" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "transactionId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "feeAmount" numeric(20,8) NOT NULL,
        "feeCurrency" character varying(10) NOT NULL,
        "feeType" "public"."fee_type_enum" NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_fee_records_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_fee_records_transactionId" FOREIGN KEY ("transactionId")
          REFERENCES "transactions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_fee_records_userId" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // Seed default fee configurations
    // SEND (DEPOSIT): 0.5% with $0.10 minimum
    await queryRunner.query(`
      INSERT INTO "fee_configs" ("transactionType", "currency", "feeType", "feeValue", "minFee", "isActive")
      VALUES ('DEPOSIT', '*', 'PERCENTAGE', 0.5, 0.1, true)
      ON CONFLICT DO NOTHING
    `);

    // EXCHANGE (SWAP/CONVERT): 0.5%
    await queryRunner.query(`
      INSERT INTO "fee_configs" ("transactionType", "currency", "feeType", "feeValue", "isActive")
      VALUES ('SWAP', '*', 'PERCENTAGE', 0.5, true)
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "fee_configs" ("transactionType", "currency", "feeType", "feeValue", "isActive")
      VALUES ('CONVERT', '*', 'PERCENTAGE', 0.5, true)
      ON CONFLICT DO NOTHING
    `);

    // WITHDRAWAL: flat $1.00
    await queryRunner.query(`
      INSERT INTO "fee_configs" ("transactionType", "currency", "feeType", "feeValue", "isActive")
      VALUES ('WITHDRAW', '*', 'FLAT', 1.0, true)
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "fee_records"');
    await queryRunner.query('DROP TABLE IF EXISTS "fee_configs"');
    await queryRunner.query('DROP TYPE IF EXISTS "public"."fee_type_enum"');
    await queryRunner.query('DROP TYPE IF EXISTS "public"."fee_transaction_type_enum"');
  }
}
