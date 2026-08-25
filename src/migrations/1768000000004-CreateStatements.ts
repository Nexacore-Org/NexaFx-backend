import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateStatements1768000000004 implements MigrationInterface {
  name = 'CreateStatements1768000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "statements" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "currency" character varying(10) NOT NULL,
        "year" integer NOT NULL,
        "month" integer NOT NULL,
        "openingBalance" numeric(20,8) NOT NULL,
        "closingBalance" numeric(20,8) NOT NULL,
        "totalCredits" numeric(20,8) NOT NULL,
        "totalDebits" numeric(20,8) NOT NULL,
        "totalFees" numeric(20,8) NOT NULL,
        "transactionCount" integer NOT NULL,
        "pdfKey" character varying(500),
        "csvKey" character varying(500),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_statements_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_statements_user_currency_period"
          UNIQUE ("userId", "currency", "year", "month"),
        CONSTRAINT "FK_statements_user"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_statements_userId"
      ON "statements" ("userId")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_statements_year_month"
      ON "statements" ("year", "month")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_statements_year_month"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_statements_userId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "statements"`);
  }
}
