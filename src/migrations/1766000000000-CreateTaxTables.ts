import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTaxTables1766000000000 implements MigrationInterface {
  name = 'CreateTaxTables1766000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create Enum Types
    await queryRunner.query(`
      CREATE TYPE "public"."tax_events_eventtype_enum" AS ENUM (
        'ACQUISITION',
        'DISPOSAL'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."tax_export_jobs_jurisdiction_enum" AS ENUM (
        'UK',
        'US',
        'GENERIC'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."tax_export_jobs_status_enum" AS ENUM (
        'PENDING',
        'PROCESSING',
        'COMPLETED',
        'FAILED'
      )
    `);

    // 2. Create price_snapshots Table
    await queryRunner.query(`
      CREATE TABLE "price_snapshots" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "transactionId" uuid NOT NULL,
        "currency" character varying(10) NOT NULL,
        "priceUsd" numeric(20,8) NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_price_snapshots_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_price_snapshots_tx_currency" UNIQUE ("transactionId", "currency"),
        CONSTRAINT "FK_price_snapshots_transactions" FOREIGN KEY ("transactionId") REFERENCES "transactions" ("id") ON DELETE CASCADE
      )
    `);

    // 3. Create cost_basis_lots Table
    await queryRunner.query(`
      CREATE TABLE "cost_basis_lots" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "currency" character varying(10) NOT NULL,
        "quantity" numeric(20,8) NOT NULL,
        "costBasisUsd" numeric(20,8) NOT NULL,
        "acquiredAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "sourceTransactionId" uuid NOT NULL,
        "remainingQuantity" numeric(20,8) NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cost_basis_lots_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cost_basis_lots_users" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_cost_basis_lots_transactions" FOREIGN KEY ("sourceTransactionId") REFERENCES "transactions" ("id") ON DELETE CASCADE
      )
    `);

    // 4. Create tax_events Table
    await queryRunner.query(`
      CREATE TABLE "tax_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "transactionId" uuid NOT NULL,
        "eventType" "public"."tax_events_eventtype_enum" NOT NULL,
        "currency" character varying(10) NOT NULL,
        "quantity" numeric(20,8) NOT NULL,
        "priceUsdAtEvent" numeric(20,8) NOT NULL,
        "costBasisUsd" numeric(20,8),
        "proceedsUsd" numeric(20,8),
        "gainLossUsd" numeric(20,8),
        "holdingPeriodDays" integer,
        "acquiredAt" TIMESTAMP WITH TIME ZONE,
        "taxYear" integer NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_tax_events_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_tax_events_users" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_tax_events_transactions" FOREIGN KEY ("transactionId") REFERENCES "transactions" ("id") ON DELETE CASCADE
      )
    `);

    // 5. Create tax_export_jobs Table
    await queryRunner.query(`
      CREATE TABLE "tax_export_jobs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "year" integer NOT NULL,
        "jurisdiction" "public"."tax_export_jobs_jurisdiction_enum" NOT NULL,
        "status" "public"."tax_export_jobs_status_enum" NOT NULL DEFAULT 'PENDING',
        "csv" text,
        "errorMessage" text,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_tax_export_jobs_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_tax_export_jobs_users" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);

    // 6. Create Indexes
    await queryRunner.query(`
      CREATE INDEX "IDX_cost_basis_lots_user_currency" ON "cost_basis_lots" ("userId", "currency")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_cost_basis_lots_matching" ON "cost_basis_lots" ("userId", "currency", "remainingQuantity")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_tax_events_user_year" ON "tax_events" ("userId", "taxYear")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_tax_events_user_currency" ON "tax_events" ("userId", "currency")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_tax_export_jobs_user_created" ON "tax_export_jobs" ("userId", "createdAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_tax_export_jobs_user_created"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_tax_events_user_currency"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_tax_events_user_year"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_cost_basis_lots_matching"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_cost_basis_lots_user_currency"');

    // Drop tables
    await queryRunner.query('DROP TABLE IF EXISTS "tax_export_jobs"');
    await queryRunner.query('DROP TABLE IF EXISTS "tax_events"');
    await queryRunner.query('DROP TABLE IF EXISTS "cost_basis_lots"');
    await queryRunner.query('DROP TABLE IF EXISTS "price_snapshots"');

    // Drop enum types
    await queryRunner.query('DROP TYPE IF EXISTS "public"."tax_export_jobs_status_enum"');
    await queryRunner.query('DROP TYPE IF EXISTS "public"."tax_export_jobs_jurisdiction_enum"');
    await queryRunner.query('DROP TYPE IF EXISTS "public"."tax_events_eventtype_enum"');
  }
}
