import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateConversionQuotes1767000000000 implements MigrationInterface {
  name = 'CreateConversionQuotes1767000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."conversion_quotes_status_enum" AS ENUM ('PENDING', 'USED', 'EXPIRED')
    `);

    await queryRunner.query(`
      CREATE TABLE "conversion_quotes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "fromCurrency" character varying(10) NOT NULL,
        "toCurrency" character varying(10) NOT NULL,
        "fromAmount" numeric(20,8) NOT NULL,
        "toAmount" numeric(20,8) NOT NULL,
        "rate" numeric(20,8) NOT NULL,
        "fee" numeric(20,8) NOT NULL,
        "feePercent" numeric(10,4) NOT NULL,
        "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "usedAt" TIMESTAMP WITH TIME ZONE,
        "status" "public"."conversion_quotes_status_enum" NOT NULL DEFAULT 'PENDING',
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_conversion_quotes_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_conversion_quotes_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_conversion_quotes_userId" ON "conversion_quotes" ("userId")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_conversion_quotes_status" ON "conversion_quotes" ("status")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_conversion_quotes_expiresAt" ON "conversion_quotes" ("expiresAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_conversion_quotes_expiresAt"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_conversion_quotes_status"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_conversion_quotes_userId"');
    await queryRunner.query('DROP TABLE IF EXISTS "conversion_quotes"');
    await queryRunner.query('DROP TYPE IF EXISTS "public"."conversion_quotes_status_enum"');
  }
}
