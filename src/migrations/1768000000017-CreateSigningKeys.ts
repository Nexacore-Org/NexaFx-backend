import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSigningKeys1768000000017 implements MigrationInterface {
  name = 'CreateSigningKeys1768000000017';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "transaction_signing_keys" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "keyName" varchar(100) NOT NULL,
        "totpSecret" varchar(255) NOT NULL,
        "isActive" boolean NOT NULL DEFAULT false,
        "activatedAt" TIMESTAMP WITH TIME ZONE,
        "lastUsedAt" TIMESTAMP WITH TIME ZONE,
        "minAmountUsd" numeric(20,8) NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_transaction_signing_keys" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "transaction_signing_keys"`);
  }
}
