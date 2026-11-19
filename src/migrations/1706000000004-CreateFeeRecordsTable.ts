import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFeeRecordsTable1706000000004 implements MigrationInterface {
  name = 'CreateFeeRecordsTable1706000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fee_records_feetype_enum') THEN
          CREATE TYPE "public"."fee_records_feetype_enum" AS ENUM ('FLAT', 'PERCENTAGE');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "fee_records" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "transactionId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "feeAmount" numeric(20,8) NOT NULL,
        "feeCurrency" varchar(10) NOT NULL,
        "feeType" "public"."fee_records_feetype_enum" NOT NULL,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_9247c10a2e9d94c53b2e90d32e9" PRIMARY KEY ("id"),
        CONSTRAINT "FK_f0a2806637ab6c3cbef929820d3" FOREIGN KEY ("transactionId")
          REFERENCES "transactions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_abbd40e1f864bec3b01c6f95bb2" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_f0a2806637ab6c3cbef929820d"
      ON "fee_records" ("transactionId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_abbd40e1f864bec3b01c6f95bb"
      ON "fee_records" ("userId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "fee_records"');
    await queryRunner.query('DROP TYPE IF EXISTS "public"."fee_records_feetype_enum"');
  }
}
