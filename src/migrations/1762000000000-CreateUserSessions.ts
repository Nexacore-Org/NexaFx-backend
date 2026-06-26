import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserSessions1762000000000 implements MigrationInterface {
  name = 'CreateUserSessions1762000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create DeviceType enum type
    await queryRunner.query(`
      CREATE TYPE "public"."user_sessions_devicetype_enum" AS ENUM(
        'MOBILE',
        'DESKTOP',
        'TABLET',
        'UNKNOWN'
      )
    `);

    // 2. Create user_sessions table
    await queryRunner.query(`
      CREATE TABLE "user_sessions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "tokenId" character varying(255) NOT NULL,
        "deviceName" character varying(255) NOT NULL,
        "deviceType" "public"."user_sessions_devicetype_enum" NOT NULL DEFAULT 'UNKNOWN',
        "browser" character varying(255) NOT NULL,
        "os" character varying(255) NOT NULL,
        "ipAddress" character varying(255) NOT NULL,
        "country" character varying(255) NOT NULL DEFAULT 'Unknown',
        "city" character varying(255) NOT NULL DEFAULT 'Unknown',
        "isTrusted" boolean NOT NULL DEFAULT false,
        "lastActiveAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "PK_user_sessions_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_user_sessions_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // 3. Create indexes
    await queryRunner.query(`
      CREATE INDEX "IDX_user_sessions_userId" ON "user_sessions" ("userId")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_user_sessions_tokenId" ON "user_sessions" ("tokenId")
    `);

    // 4. Add jti column to refresh_tokens table
    if (await queryRunner.hasTable('refresh_tokens')) {
      await queryRunner.query(`
        ALTER TABLE "refresh_tokens"
        ADD COLUMN "jti" character varying(255)
      `);
      await queryRunner.query(`
        CREATE INDEX "IDX_refresh_tokens_jti" ON "refresh_tokens" ("jti")
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('refresh_tokens')) {
      await queryRunner.query(`
        DROP INDEX IF EXISTS "IDX_refresh_tokens_jti"
      `);
      await queryRunner.query(`
        ALTER TABLE "refresh_tokens"
        DROP COLUMN IF EXISTS "jti"
      `);
    }

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_user_sessions_tokenId"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_user_sessions_userId"
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS "user_sessions"
    `);
    await queryRunner.query(`
      DROP TYPE IF EXISTS "public"."user_sessions_devicetype_enum"
    `);
  }
}
