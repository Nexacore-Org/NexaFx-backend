import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEscrowsTable1762000000000 implements MigrationInterface {
  name = 'CreateEscrowsTable1762000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."escrows_status_enum" AS ENUM (
        'PENDING',
        'FUNDED',
        'RELEASED',
        'REFUNDED',
        'DISPUTED',
        'RESOLVED'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "escrows" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "senderId" uuid NOT NULL,
        "recipientId" uuid NOT NULL,
        "amount" numeric(20,8) NOT NULL,
        "currency" varchar(10) NOT NULL,
        "title" varchar(255) NOT NULL,
        "description" text NOT NULL,
        "status" "public"."escrows_status_enum" NOT NULL DEFAULT 'PENDING',
        "releaseCondition" text NOT NULL,
        "autoReleaseAt" TIMESTAMP WITH TIME ZONE,
        "disputeWindowHours" int NOT NULL DEFAULT 24,
        "stellarEscrowPublicKey" varchar(56),
        "stellarEscrowSecretEncrypted" text,
        "fundedTxHash" text,
        "releaseTxHash" text,
        "refundTxHash" text,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "fundedAt" TIMESTAMP WITH TIME ZONE,
        "releasedAt" TIMESTAMP WITH TIME ZONE,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_escrows_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_escrows_sender_recipient" ON "escrows" ("senderId", "recipientId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_escrows_status_autoReleaseAt" ON "escrows" ("status", "autoReleaseAt")
    `);

    await queryRunner.query(`
      ALTER TABLE "escrows"
      ADD CONSTRAINT "FK_escrows_sender_users" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "escrows"
      ADD CONSTRAINT "FK_escrows_recipient_users" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "escrows" DROP CONSTRAINT IF EXISTS "FK_escrows_recipient_users"');
    await queryRunner.query('ALTER TABLE "escrows" DROP CONSTRAINT IF EXISTS "FK_escrows_sender_users"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_escrows_status_autoReleaseAt"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_escrows_sender_recipient"');
    await queryRunner.query('DROP TABLE IF EXISTS "escrows"');
    await queryRunner.query('DROP TYPE IF EXISTS "public"."escrows_status_enum"');
  }
