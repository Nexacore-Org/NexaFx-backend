import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLoans1762000000000 implements MigrationInterface {
  name = 'CreateLoans1762000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Extend transactions type enum with loan types
    await queryRunner.query(`
      ALTER TYPE "public"."transactions_type_enum"
        ADD VALUE IF NOT EXISTS 'LOAN_DISBURSEMENT'
    `);
    await queryRunner.query(`
      ALTER TYPE "public"."transactions_type_enum"
        ADD VALUE IF NOT EXISTS 'LOAN_REPAYMENT'
    `);

    // loan_applications status enum
    await queryRunner.query(`
      CREATE TYPE "public"."loan_applications_status_enum" AS ENUM (
        'PENDING',
        'APPROVED',
        'REJECTED',
        'ACTIVE',
        'REPAID',
        'DEFAULTED'
      )
    `);

    // loan_repayments status enum
    await queryRunner.query(`
      CREATE TYPE "public"."loan_repayments_status_enum" AS ENUM (
        'SCHEDULED',
        'PAID',
        'PARTIAL',
        'OVERDUE',
        'WAIVED'
      )
    `);

    // loan_applications table
    await queryRunner.query(`
      CREATE TABLE "loan_applications" (
        "id"                   uuid          NOT NULL DEFAULT uuid_generate_v4(),
        "userId"               uuid          NOT NULL,
        "requestedAmount"      numeric(20,8) NOT NULL,
        "currency"             varchar(10)   NOT NULL DEFAULT 'XLM',
        "termDays"             int           NOT NULL,
        "interestRatePercent"  numeric(5,4)  NOT NULL DEFAULT 0,
        "status"               "public"."loan_applications_status_enum" NOT NULL DEFAULT 'PENDING',
        "creditScore"          int           NOT NULL DEFAULT 0,
        "rejectionReason"      varchar(500)  NULL,
        "reviewedBy"           uuid          NULL,
        "approvedAmount"       numeric(20,8) NULL,
        "disbursedAt"          TIMESTAMP WITH TIME ZONE NULL,
        "dueDate"              TIMESTAMP WITH TIME ZONE NULL,
        "createdAt"            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_loan_applications" PRIMARY KEY ("id"),
        CONSTRAINT "FK_loan_applications_user"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_loan_applications_userId_status"
        ON "loan_applications" ("userId", "status")
    `);

    // loan_repayments table
    await queryRunner.query(`
      CREATE TABLE "loan_repayments" (
        "id"               uuid          NOT NULL DEFAULT uuid_generate_v4(),
        "loanId"           uuid          NOT NULL,
        "dueDate"          date          NOT NULL,
        "principalAmount"  numeric(20,8) NOT NULL,
        "interestAmount"   numeric(20,8) NOT NULL,
        "penaltyAmount"    numeric(20,8) NOT NULL DEFAULT 0,
        "totalDue"         numeric(20,8) NOT NULL,
        "paidAmount"       numeric(20,8) NOT NULL DEFAULT 0,
        "status"           "public"."loan_repayments_status_enum" NOT NULL DEFAULT 'SCHEDULED',
        "paidAt"           TIMESTAMP WITH TIME ZONE NULL,
        CONSTRAINT "PK_loan_repayments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_loan_repayments_loan"
          FOREIGN KEY ("loanId") REFERENCES "loan_applications"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_loan_repayments_loanId_status"
        ON "loan_repayments" ("loanId", "status")
    `);

    // compliance_flags table
    await queryRunner.query(`
      CREATE TABLE "compliance_flags" (
        "id"          uuid         NOT NULL DEFAULT uuid_generate_v4(),
        "userId"      uuid         NOT NULL,
        "reason"      varchar(255) NOT NULL,
        "entityId"    uuid         NULL,
        "isResolved"  boolean      NOT NULL DEFAULT false,
        "resolvedAt"  TIMESTAMP WITH TIME ZONE NULL,
        "createdAt"   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_compliance_flags" PRIMARY KEY ("id"),
        CONSTRAINT "FK_compliance_flags_user"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_compliance_flags_userId_isResolved"
        ON "compliance_flags" ("userId", "isResolved")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_compliance_flags_userId_createdAt"
        ON "compliance_flags" ("userId", "createdAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "compliance_flags"');
    await queryRunner.query('DROP TABLE IF EXISTS "loan_repayments"');
    await queryRunner.query('DROP TABLE IF EXISTS "loan_applications"');
    await queryRunner.query(
      'DROP TYPE IF EXISTS "public"."loan_repayments_status_enum"',
    );
    await queryRunner.query(
      'DROP TYPE IF EXISTS "public"."loan_applications_status_enum"',
    );
    // Note: PostgreSQL does not support removing enum values, so LOAN_DISBURSEMENT
    // and LOAN_REPAYMENT cannot be removed from transactions_type_enum in down().
  }
}
