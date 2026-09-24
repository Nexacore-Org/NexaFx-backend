import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSavingsVaults1762000000000 implements MigrationInterface {
  name = 'CreateSavingsVaults1762000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."savings_vaults_status_enum" AS ENUM (
        'ACTIVE', 'MATURED', 'CLOSED', 'BROKEN'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."savings_vaults_autodepositfrequency_enum" AS ENUM (
        'DAILY', 'WEEKLY', 'MONTHLY'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."vault_transactions_type_enum" AS ENUM (
        'DEPOSIT', 'WITHDRAWAL', 'INTEREST', 'PENALTY'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "savings_vaults" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "name" character varying(255) NOT NULL,
        "currency" character varying(10) NOT NULL,
        "targetAmount" numeric(20,8) NOT NULL,
        "currentBalance" numeric(20,8) NOT NULL DEFAULT '0',
        "annualInterestRate" numeric(5,4) NOT NULL DEFAULT '0.05',
        "accruedInterest" numeric(20,8) NOT NULL DEFAULT '0',
        "unlockAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "status" "public"."savings_vaults_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "earlyWithdrawalPenaltyPercent" numeric(5,4) NOT NULL DEFAULT '0.10',
        "autoDepositAmount" numeric(20,8),
        "autoDepositFrequency" "public"."savings_vaults_autodepositfrequency_enum",
        "lastInterestAccruedAt" TIMESTAMP WITH TIME ZONE,
        "maturedAt" TIMESTAMP WITH TIME ZONE,
        "closedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_savings_vaults_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_savings_vaults_userId_status"
        ON "savings_vaults" ("userId", "status")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_savings_vaults_status_unlockAt"
        ON "savings_vaults" ("status", "unlockAt")
    `);

    await queryRunner.query(`
      ALTER TABLE "savings_vaults"
        ADD CONSTRAINT "FK_savings_vaults_userId"
        FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      CREATE TABLE "vault_transactions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "vaultId" uuid NOT NULL,
        "type" "public"."vault_transactions_type_enum" NOT NULL,
        "amount" numeric(20,8) NOT NULL,
        "balanceBefore" numeric(20,8) NOT NULL,
        "balanceAfter" numeric(20,8) NOT NULL,
        "note" character varying,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_vault_transactions_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_vault_transactions_vaultId_createdAt"
        ON "vault_transactions" ("vaultId", "createdAt")
    `);

    await queryRunner.query(`
      ALTER TABLE "vault_transactions"
        ADD CONSTRAINT "FK_vault_transactions_vaultId"
        FOREIGN KEY ("vaultId") REFERENCES "savings_vaults"("id") ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_vault_transactions_vaultId_createdAt"',
    );
    await queryRunner.query(
      'ALTER TABLE "vault_transactions" DROP CONSTRAINT IF EXISTS "FK_vault_transactions_vaultId"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "vault_transactions"');
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_savings_vaults_userId_status"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_savings_vaults_status_unlockAt"',
    );
    await queryRunner.query(
      'ALTER TABLE "savings_vaults" DROP CONSTRAINT IF EXISTS "FK_savings_vaults_userId"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "savings_vaults"');
    await queryRunner.query(
      'DROP TYPE IF EXISTS "public"."vault_transactions_type_enum"',
    );
    await queryRunner.query(
      'DROP TYPE IF EXISTS "public"."savings_vaults_autodepositfrequency_enum"',
    );
    await queryRunner.query(
      'DROP TYPE IF EXISTS "public"."savings_vaults_status_enum"',
    );
  }
}
