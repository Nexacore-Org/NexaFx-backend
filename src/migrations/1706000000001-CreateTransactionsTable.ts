import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTransactionsTable1706000000001 implements MigrationInterface {
  name = 'CreateTransactionsTable1706000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transactions_type_enum') THEN
          CREATE TYPE "public"."transactions_type_enum" AS ENUM (
            'DEPOSIT', 'WITHDRAW', 'SWAP', 'LOAN_DISBURSEMENT', 'LOAN_REPAYMENT'
          );
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transactions_status_enum') THEN
          CREATE TYPE "public"."transactions_status_enum" AS ENUM (
            'PENDING', 'SUCCESS', 'FAILED', 'CANCELLED'
          );
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "transactions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "type" "public"."transactions_type_enum" NOT NULL,
        "amount" numeric(20,8) NOT NULL,
        "currency" varchar(10) NOT NULL,
        "rate" numeric(20,8),
        "status" "public"."transactions_status_enum" NOT NULL DEFAULT 'PENDING',
        "txHash" varchar(255),
        "reference" varchar(255),
        "stellarTxHash" varchar(255),
        "failureReason" text,
        "feeAmount" numeric(20,8),
        "feeCurrency" varchar(10),
        "toCurrency" varchar(10),
        "toAmount" numeric(20,8),
        "metadata" jsonb,
        "userNote" text,
        "counterpartyMemo" varchar(200),
        "tags" text[],
        "processingLockedAt" timestamp,
        "processingLockedBy" varchar(255),
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_a219afd8dd77ed80f5a862f1db9" PRIMARY KEY ("id"),
        CONSTRAINT "FK_6bb58f2b6e30cb51a6504599f41" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_6bb58f2b6e30cb51a6504599f4" ON "transactions" ("userId")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_da87c55b3bbbe96c6ed88ea7ee" ON "transactions" ("status")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_2d5fa024a84dceb158b2b95f34" ON "transactions" ("type")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_c3dd9222a377f7cdfc954fcf0c" ON "transactions" ("currency")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_e744417ceb0b530285c08f3865" ON "transactions" ("createdAt")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_5dc7be0581e635b1bb55caea1b" ON "transactions" ("status", "createdAt")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_710c9fc241e246a373c8ad03b4" ON "transactions" ("userId", "status")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_50f153eff86ab280bff15a30f6" ON "transactions" ("counterpartyMemo")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "transactions"');
    await queryRunner.query('DROP TYPE IF EXISTS "public"."transactions_status_enum"');
    await queryRunner.query('DROP TYPE IF EXISTS "public"."transactions_type_enum"');
  }
}
