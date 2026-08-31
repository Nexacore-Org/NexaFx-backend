import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOptions1768000000009 implements MigrationInterface {
  name = 'CreateOptions1768000000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "option_contracts_type_enum" AS ENUM ('CALL')
    `);

    await queryRunner.query(`
      CREATE TYPE "option_contracts_status_enum" AS ENUM ('ACTIVE', 'EXERCISED', 'EXPIRED')
    `);

    await queryRunner.query(`
      CREATE TABLE "option_contracts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "type" "option_contracts_type_enum" NOT NULL DEFAULT 'CALL',
        "underlyingCurrency" varchar(10) NOT NULL DEFAULT 'XLM',
        "settlementCurrency" varchar(10) NOT NULL DEFAULT 'NGN',
        "strikePrice" numeric(20,8) NOT NULL,
        "expiryDate" date NOT NULL,
        "contractSize" numeric(20,8) NOT NULL,
        "premium" numeric(20,8) NOT NULL,
        "status" "option_contracts_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "exercisedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "FK_option_contracts_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_option_contracts_userId" ON "option_contracts" ("userId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_option_contracts_status" ON "option_contracts" ("status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_option_contracts_status"`);
    await queryRunner.query(`DROP INDEX "IDX_option_contracts_userId"`);
    await queryRunner.query(`DROP TABLE "option_contracts"`);
    await queryRunner.query(`DROP TYPE "option_contracts_status_enum"`);
    await queryRunner.query(`DROP TYPE "option_contracts_type_enum"`);
  }
}
