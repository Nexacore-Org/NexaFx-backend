import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLinkedBankAccounts1768000000013 implements MigrationInterface {
  name = 'CreateLinkedBankAccounts1768000000013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "linked_bank_accounts_provider_enum" AS ENUM (
        'MONO', 'OKRA'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "linked_bank_accounts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "provider" "linked_bank_accounts_provider_enum" NOT NULL,
        "accountId" character varying(255) NOT NULL,
        "bankName" character varying(200) NOT NULL,
        "accountName" character varying(200) NOT NULL,
        "accountNumber" character varying(4) NOT NULL,
        "currency" character varying(10) NOT NULL DEFAULT 'NGN',
        "lastSyncedAt" TIMESTAMP WITH TIME ZONE,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_linked_bank_accounts" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "linked_bank_accounts"
      ADD CONSTRAINT "FK_linked_bank_accounts_userId"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "linked_bank_accounts" DROP CONSTRAINT "FK_linked_bank_accounts_userId"`,
    );
    await queryRunner.query(`DROP TABLE "linked_bank_accounts"`);
    await queryRunner.query(`DROP TYPE "linked_bank_accounts_provider_enum"`);
  }
}
