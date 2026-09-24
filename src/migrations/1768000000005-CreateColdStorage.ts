import { MigrationInterface, QueryRunner } from 'typeorm';
export class CreateColdStorage1768000000005 implements MigrationInterface {
  name = 'CreateColdStorage1768000000005';
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "public"."cold_storage_withdrawals_status_enum" AS ENUM ('PENDING_APPROVAL','APPROVED','WAITING_PERIOD','READY_TO_CONFIRM','COMPLETED','REJECTED')`);
    await queryRunner.query(`CREATE TABLE "cold_storage_accounts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(),"userId" uuid NOT NULL,"currency" character varying(10) NOT NULL,"stellarPublicKey" character varying(64) NOT NULL,"balance" numeric(20,8) NOT NULL DEFAULT '0.00000000',"pendingWithdrawals" numeric(20,8) NOT NULL DEFAULT '0.00000000',"isVerified" boolean NOT NULL DEFAULT false,"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),"updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_cold_storage_accounts_id" PRIMARY KEY ("id"),CONSTRAINT "UQ_cold_storage_accounts_user_currency" UNIQUE ("userId","currency"),CONSTRAINT "FK_cold_storage_accounts_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE)`);
    await queryRunner.query(`CREATE TABLE "cold_storage_withdrawals" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(),"coldStorageAccountId" uuid NOT NULL,"userId" uuid NOT NULL,"amount" numeric(20,8) NOT NULL,"status" "public"."cold_storage_withdrawals_status_enum" NOT NULL DEFAULT 'PENDING_APPROVAL',"adminId" character varying(255),"approvedAt" TIMESTAMP WITH TIME ZONE,"readyAt" TIMESTAMP WITH TIME ZONE,"completedAt" TIMESTAMP WITH TIME ZONE,"rejectionReason" text,"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),"updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_cold_storage_withdrawals_id" PRIMARY KEY ("id"),CONSTRAINT "FK_cold_storage_withdrawals_account" FOREIGN KEY ("coldStorageAccountId") REFERENCES "cold_storage_accounts"("id") ON DELETE CASCADE)`);
    await queryRunner.query(`CREATE INDEX "IDX_cold_storage_accounts_userId" ON "cold_storage_accounts" ("userId")`);
    await queryRunner.query(`CREATE INDEX "IDX_cold_storage_withdrawals_status" ON "cold_storage_withdrawals" ("status")`);
  }
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cold_storage_withdrawals_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cold_storage_accounts_userId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cold_storage_withdrawals"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cold_storage_accounts"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."cold_storage_withdrawals_status_enum"`);
  }
}
