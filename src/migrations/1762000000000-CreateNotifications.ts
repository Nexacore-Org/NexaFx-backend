import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotifications1762000000000 implements MigrationInterface {
  name = 'CreateNotifications1762000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create enum type for notification types
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notifications_type_enum') THEN
          CREATE TYPE "public"."notifications_type_enum" AS ENUM('TRANSACTION', 'KYC', 'RATE_ALERT', 'SYSTEM');
        END IF;
      END
      $$;
    `);

    // 2. Create notifications table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notifications" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "type" "public"."notifications_type_enum" NOT NULL DEFAULT 'SYSTEM',
        "title" character varying NOT NULL,
        "body" text NOT NULL,
        "data" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "isRead" boolean NOT NULL DEFAULT false,
        "readAt" timestamp without time zone,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notifications_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_notifications_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // 3. Create indices for performance optimization
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_notifications_userId_isRead" ON "notifications" ("userId", "isRead")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_notifications_userId_createdAt" ON "notifications" ("userId", "createdAt")
    `);

    // 4. Add columns to users table
    if (await queryRunner.hasTable('users')) {
      await queryRunner.query(`
        ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "notificationPreferences" jsonb DEFAULT '{"email": true, "push": true, "types": {"TRANSACTION": true, "KYC": true, "RATE_ALERT": true}}'::jsonb
      `);
      await queryRunner.query(`
        ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "fcmToken" character varying(255)
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('users')) {
      await queryRunner.query(`
        ALTER TABLE "users"
        DROP COLUMN IF EXISTS "notificationPreferences",
        DROP COLUMN IF EXISTS "fcmToken"
      `);
    }

    await queryRunner.query(`
      DROP TABLE IF EXISTS "notifications"
    `);

    await queryRunner.query(`
      DROP TYPE IF EXISTS "public"."notifications_type_enum"
    `);
  }
}
