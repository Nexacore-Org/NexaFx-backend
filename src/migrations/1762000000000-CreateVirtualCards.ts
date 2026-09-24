import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateVirtualCards1762000000000 implements MigrationInterface {
  name = 'CreateVirtualCards1762000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('users')) {
      await queryRunner.query(`
        ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "stripeCardholderId" character varying(255)
      `);
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "IDX_users_stripeCardholderId" ON "users" ("stripeCardholderId")
      `);
    }

    await queryRunner.query(`
      CREATE TYPE "public"."virtual_cards_status_enum" AS ENUM (
        'ACTIVE',
        'FROZEN',
        'CANCELLED'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "virtual_cards" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "stripeCardId" character varying(255) NOT NULL,
        "last4" character varying(4) NOT NULL,
        "expMonth" character varying(10) NOT NULL,
        "expYear" character varying(4) NOT NULL,
        "brand" character varying(255),
        "status" "public"."virtual_cards_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "spendLimit" numeric(20,8),
        "blockedMccs" jsonb NOT NULL DEFAULT '[]',
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_virtual_cards_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_virtual_cards_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_virtual_cards_userId" ON "virtual_cards" ("userId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_virtual_cards_userId"');
    await queryRunner.query('DROP TABLE IF EXISTS "virtual_cards"');
    await queryRunner.query('DROP TYPE IF EXISTS "public"."virtual_cards_status_enum"');
    if (await queryRunner.hasTable('users')) {
      await queryRunner.query('DROP INDEX IF EXISTS "IDX_users_stripeCardholderId"');
      await queryRunner.query('ALTER TABLE "users" DROP COLUMN IF EXISTS "stripeCardholderId"');
    }
  }
}
