import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLedgerEntriesTable1706000000005 implements MigrationInterface {
  name = 'CreateLedgerEntriesTable1706000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ledger_entries_accounttype_enum') THEN
          CREATE TYPE "public"."ledger_entries_accounttype_enum" AS ENUM (
            'USER', 'PLATFORM_ASSET', 'PLATFORM_LIABILITY', 'FEE_REVENUE'
          );
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ledger_entries_direction_enum') THEN
          CREATE TYPE "public"."ledger_entries_direction_enum" AS ENUM ('DEBIT', 'CREDIT');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ledger_entries" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "transactionId" uuid NOT NULL,
        "accountType" "public"."ledger_entries_accounttype_enum" NOT NULL,
        "direction" "public"."ledger_entries_direction_enum" NOT NULL,
        "amount" numeric(20,8) NOT NULL,
        "currency" varchar(10) NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_6efcb84411d3f08b08450ae75d5" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ce01dd5f8bde23f503bf01ffacc" FOREIGN KEY ("transactionId")
          REFERENCES "transactions"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_ce01dd5f8bde23f503bf01ffac"
      ON "ledger_entries" ("transactionId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_66ee1524cedcae63e5ffdec6c2"
      ON "ledger_entries" ("currency", "direction")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "ledger_entries"');
    await queryRunner.query(
      'DROP TYPE IF EXISTS "public"."ledger_entries_direction_enum"',
    );
    await queryRunner.query(
      'DROP TYPE IF EXISTS "public"."ledger_entries_accounttype_enum"',
    );
  }
}
