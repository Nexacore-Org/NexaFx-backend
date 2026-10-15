import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the tables that production needs but no migration ever created:
 * expenses, erasure_audit_logs, audit_log_export_jobs, audit_log_schedules,
 * report_jobs and report_schedules.
 *
 * With `synchronize: false` outside development these were missing entirely, so
 * GDPR erasure (expenses, erasure_audit_logs), the audit export (export jobs)
 * and report scheduling all failed with "relation does not exist".
 */
export class CreateExpenseAuditAndReportTables1785000000000
  implements MigrationInterface
{
  name = 'CreateExpenseAuditAndReportTables1785000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "expenses_status_enum" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "expenses" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "transactionId" uuid,
        "organisationId" uuid,
        "amount" numeric(20,8) NOT NULL,
        "currency" varchar(10) NOT NULL,
        "amountUsd" numeric(20,8) NOT NULL,
        "expenseCategory" varchar(50) NOT NULL,
        "description" varchar(255) NOT NULL,
        "merchant" varchar(255),
        "receiptKey" varchar(512),
        "isBillable" boolean NOT NULL DEFAULT false,
        "clientId" varchar(100),
        "taxDeductible" boolean NOT NULL DEFAULT false,
        "date" date NOT NULL,
        "status" "expenses_status_enum" NOT NULL DEFAULT 'DRAFT',
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_expenses" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "erasure_audit_logs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "erasedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "filesDeleted" integer NOT NULL DEFAULT 0,
        "failedDeletions" text,
        CONSTRAINT "PK_erasure_audit_logs" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "audit_log_export_jobs_status_enum" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "audit_log_export_jobs_format_enum" AS ENUM ('PDF', 'CSV');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "audit_log_export_jobs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "adminUserId" uuid NOT NULL,
        "status" "audit_log_export_jobs_status_enum" NOT NULL DEFAULT 'PENDING',
        "format" "audit_log_export_jobs_format_enum" NOT NULL,
        "filters" jsonb NOT NULL,
        "filename" varchar(255),
        "fileSize" bigint,
        "errorMessage" text,
        "recordCount" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "completedAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_audit_log_export_jobs" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_audit_log_export_jobs_adminUserId" ON "audit_log_export_jobs" ("adminUserId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_audit_log_export_jobs_status" ON "audit_log_export_jobs" ("status")`,
    );

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "audit_log_schedules_frequency_enum" AS ENUM ('MONTHLY');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "audit_log_schedules" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "adminUserId" uuid NOT NULL,
        "adminEmail" varchar(255) NOT NULL,
        "frequency" "audit_log_schedules_frequency_enum" NOT NULL DEFAULT 'MONTHLY',
        "lastRun" TIMESTAMP WITH TIME ZONE,
        "nextRun" TIMESTAMP WITH TIME ZONE NOT NULL,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_audit_log_schedules" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_audit_log_schedules_adminUserId" ON "audit_log_schedules" ("adminUserId")`,
    );

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "report_jobs_status_enum" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "report_jobs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "jobId" varchar(255) NOT NULL,
        "status" "report_jobs_status_enum" NOT NULL,
        "parameters" text,
        "result" text,
        "error" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_report_jobs" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "report_schedules_reportType_enum" AS ENUM ('REVENUE', 'COHORT', 'FUNNEL', 'TOP_USERS');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "report_schedules_frequency_enum" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "report_schedules" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "reportType" "report_schedules_reportType_enum" NOT NULL,
        "frequency" "report_schedules_frequency_enum" NOT NULL,
        "recipientEmail" varchar(255) NOT NULL,
        "parameters" text,
        "nextRunAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_report_schedules" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "report_schedules"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "report_jobs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_log_schedules"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_log_export_jobs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "erasure_audit_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "expenses"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "report_schedules_frequency_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "report_schedules_reportType_enum"`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "report_jobs_status_enum"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "audit_log_schedules_frequency_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "audit_log_export_jobs_format_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "audit_log_export_jobs_status_enum"`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "expenses_status_enum"`);
  }
}
