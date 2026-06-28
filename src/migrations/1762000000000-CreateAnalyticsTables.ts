import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAnalyticsTables1762000000000 implements MigrationInterface {
  name = 'CreateAnalyticsTables1762000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create transaction_categories table
    await queryRunner.query(`
      CREATE TABLE "transaction_categories" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar(100) NOT NULL,
        "icon" varchar(10) NOT NULL DEFAULT '📦',
        "color" varchar(7) NOT NULL DEFAULT '#6366f1',
        "isSystem" boolean NOT NULL DEFAULT false,
        "userId" uuid DEFAULT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_transaction_categories_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_transaction_categories_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_transaction_categories_userId" ON "transaction_categories" ("userId")
    `);

    // 2. Seed system categories
    await queryRunner.query(`
      INSERT INTO "transaction_categories" ("name", "icon", "color", "isSystem") VALUES
      ('Transfers', '↗️', '#3b82f6', true),
      ('Exchange', '🔄', '#8b5cf6', true),
      ('Savings', '🏦', '#10b981', true),
      ('Fees', '💸', '#ef4444', true),
      ('Referral Rewards', '🎁', '#f59e0b', true),
      ('Escrow', '🔒', '#6366f1', true),
      ('Payroll', '📋', '#14b8a6', true),
      ('Other', '📦', '#6b7280', true)
    `);

    // 3. Add categoryId column to transactions table
    await queryRunner.query(`
      ALTER TABLE "transactions"
      ADD COLUMN "categoryId" uuid DEFAULT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "transactions"
      ADD CONSTRAINT "FK_transactions_categoryId"
      FOREIGN KEY ("categoryId") REFERENCES "transaction_categories"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_transactions_categoryId" ON "transactions" ("categoryId")
    `);

    // 4. Create balance_snapshots table
    await queryRunner.query(`
      CREATE TABLE "balance_snapshots" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "balances" jsonb NOT NULL,
        "snapshotDate" date NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_balance_snapshots_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_balance_snapshots_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_balance_snapshots_userId" ON "balance_snapshots" ("userId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_balance_snapshots_snapshotDate" ON "balance_snapshots" ("snapshotDate")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_balance_snapshots_userId_snapshotDate" ON "balance_snapshots" ("userId", "snapshotDate")
    `);

    // 5. Create report_export_jobs table
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."report_export_jobs_status_enum" AS ENUM (
          'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."report_export_jobs_format_enum" AS ENUM (
          'CSV', 'PDF'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE "report_export_jobs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "status" "public"."report_export_jobs_status_enum" NOT NULL DEFAULT 'PENDING',
        "format" "public"."report_export_jobs_format_enum" NOT NULL,
        "fromDate" TIMESTAMP WITH TIME ZONE NOT NULL,
        "toDate" TIMESTAMP WITH TIME ZONE NOT NULL,
        "filename" varchar(255) DEFAULT NULL,
        "s3Url" varchar(512) DEFAULT NULL,
        "fileSize" bigint DEFAULT NULL,
        "errorMessage" text DEFAULT NULL,
        "recordCount" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "completedAt" TIMESTAMP WITH TIME ZONE DEFAULT NULL,
        CONSTRAINT "PK_report_export_jobs_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_report_export_jobs_userId" ON "report_export_jobs" ("userId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_report_export_jobs_status" ON "report_export_jobs" ("status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "report_export_jobs"');
    await queryRunner.query(
      'DROP TYPE IF EXISTS "public"."report_export_jobs_status_enum"',
    );
    await queryRunner.query(
      'DROP TYPE IF EXISTS "public"."report_export_jobs_format_enum"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "balance_snapshots"');

    if (await queryRunner.hasColumn('transactions', 'categoryId')) {
      await queryRunner.query(
        'ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "FK_transactions_categoryId"',
      );
      await queryRunner.query(
        'ALTER TABLE "transactions" DROP COLUMN IF EXISTS "categoryId"',
      );
    }

    await queryRunner.query('DROP TABLE IF EXISTS "transaction_categories"');
  }
}
