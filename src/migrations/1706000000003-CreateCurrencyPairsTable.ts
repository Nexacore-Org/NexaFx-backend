import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCurrencyPairsTable1706000000003 implements MigrationInterface {
  name = 'CreateCurrencyPairsTable1706000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "currency_pairs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "fromCurrencyCode" varchar(10) NOT NULL,
        "toCurrencyCode" varchar(10) NOT NULL,
        "spreadPercent" numeric(5,2) NOT NULL DEFAULT 0,
        "minAmountUsd" numeric(18,8),
        "maxAmountUsd" numeric(18,8),
        "isActive" boolean NOT NULL DEFAULT true,
        "suspendedUntil" timestamp,
        "suspensionReason" text,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_dadf101ef21de770fa8dcfae1b5" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_6f7a5491a38300eb01394b1f0b"
      ON "currency_pairs" ("fromCurrencyCode", "toCurrencyCode")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "currency_pairs"');
  }
}
