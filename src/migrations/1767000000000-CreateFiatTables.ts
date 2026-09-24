import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFiatTables1767000000000 implements MigrationInterface {
  name = 'CreateFiatTables1767000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "fiat_deposits" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "reference" character varying(255) NOT NULL,
        "amount" numeric(20,8) NOT NULL,
        "currency" character varying(10) NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'PENDING',
        "providerReference" character varying(255),
        "paymentLink" text,
        "expiresAt" TIMESTAMP WITH TIME ZONE,
        "walletCreditedAt" TIMESTAMP WITH TIME ZONE,
        "failureReason" text,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_fiat_deposits_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_fiat_deposits_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_fiat_deposits_reference" UNIQUE ("reference")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_fiat_deposits_userId" ON "fiat_deposits" ("userId")
    `);

    await queryRunner.query(`
      CREATE TABLE "fiat_withdrawals" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "reference" character varying(255) NOT NULL,
        "amount" numeric(20,8) NOT NULL,
        "currency" character varying(10) NOT NULL,
        "bankCode" character varying(20) NOT NULL,
        "accountNumber" character varying(20) NOT NULL,
        "accountName" character varying(255) NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'PENDING',
        "providerReference" character varying(255),
        "failureReason" text,
        "processedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_fiat_withdrawals_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_fiat_withdrawals_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_fiat_withdrawals_reference" UNIQUE ("reference")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_fiat_withdrawals_userId" ON "fiat_withdrawals" ("userId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "fiat_withdrawals"');
    await queryRunner.query('DROP TABLE IF EXISTS "fiat_deposits"');
  }
}
