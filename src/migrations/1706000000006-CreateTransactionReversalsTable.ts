import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTransactionReversalsTable1706000000006 implements MigrationInterface {
  name = 'CreateTransactionReversalsTable1706000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transaction_reversals_status_enum') THEN
          CREATE TYPE "public"."transaction_reversals_status_enum" AS ENUM (
            'PENDING_CONFIRMATION', 'COMPLETED', 'FAILED'
          );
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "transaction_reversals" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "transactionId" uuid NOT NULL,
        "reversalTransactionId" uuid,
        "reason" text,
        "authorisedBy" uuid,
        "legalReference" varchar(255),
        "status" "public"."transaction_reversals_status_enum" NOT NULL
          DEFAULT 'PENDING_CONFIRMATION',
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "completedAt" timestamp,
        CONSTRAINT "PK_9ea67e45b4336a6a9044c7306b1" PRIMARY KEY ("id"),
        CONSTRAINT "FK_71b4b9e40b2e4b769b768c36515" FOREIGN KEY ("transactionId")
          REFERENCES "transactions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_ec3aff514ec08b79495fee2f1ab" FOREIGN KEY ("authorisedBy")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_71b4b9e40b2e4b769b768c3651"
      ON "transaction_reversals" ("transactionId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "transaction_reversals"');
    await queryRunner.query(
      'DROP TYPE IF EXISTS "public"."transaction_reversals_status_enum"',
    );
  }
}
