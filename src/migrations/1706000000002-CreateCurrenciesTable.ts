import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCurrenciesTable1706000000002 implements MigrationInterface {
  name = 'CreateCurrenciesTable1706000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "currencies" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "code" varchar(10) NOT NULL,
        "name" varchar(100) NOT NULL,
        "symbol" varchar(10),
        "decimals" integer NOT NULL DEFAULT 2,
        "isBase" boolean NOT NULL DEFAULT false,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_d528c54860c4182db13548e08c4" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_9f8d0972aeeb5a2277e40332d29" UNIQUE ("code")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "currencies"');
  }
}
