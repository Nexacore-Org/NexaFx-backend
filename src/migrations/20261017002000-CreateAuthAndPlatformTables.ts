import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the auth and platform tables whose entities ship with the code but
 * which no migration ever created.
 *
 * Production and staging run with synchronize: false, so a database built
 * from migrations alone had no refresh_tokens, otps, backup_codes,
 * password_reset_attempts, rate_limit_configs, data_requests or
 * idempotency_records tables: login OTPs, refresh tokens and 2FA backup
 * codes all failed. AddMissingIndexes already created an index on `otps`,
 * which made a fresh migration run fail before it got this far.
 *
 * Every statement is guarded with IF NOT EXISTS / hasTable so the migration
 * is safe on databases that were created with synchronize: true in staging.
 */
export class CreateAuthAndPlatformTables20261017002000
  implements MigrationInterface
{
  name = 'CreateAuthAndPlatformTables20261017002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasUsers = await queryRunner.hasTable('users');

    // uuid_generate_v4() backs the primary keys below.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(
      `DO $$ BEGIN CREATE TYPE "public"."otps_type_enum" AS ENUM ('LOGIN', 'PASSWORD_RESET', 'SIGNUP'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    );
    await queryRunner.query(
      `DO $$ BEGIN CREATE TYPE "public"."data_requests_type_enum" AS ENUM ('EXPORT', 'DELETION'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    );
    await queryRunner.query(
      `DO $$ BEGIN CREATE TYPE "public"."data_requests_status_enum" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETE', 'FAILED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    );
    if (hasUsers) {
      await queryRunner.query(
        `DO $$ BEGIN CREATE TYPE "public"."users_plan_enum" AS ENUM ('FREE', 'BASIC', 'PREMIUM', 'ENTERPRISE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      );
    }

    if (!(await queryRunner.hasTable('refresh_tokens'))) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "refresh_tokens" (
          "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
          "userId" uuid NOT NULL,
          "tokenHash" character varying(255) NOT NULL,
          "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
          "revokedAt" TIMESTAMP WITH TIME ZONE,
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          CONSTRAINT "PK_refresh_tokens_id" PRIMARY KEY ("id")
        )
      `);
      await queryRunner.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_refresh_tokens_tokenHash" ON "refresh_tokens" ("tokenHash")`,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "IDX_refresh_tokens_userId_revokedAt" ON "refresh_tokens" ("userId", "revokedAt")`,
      );
      if (hasUsers) {
        await queryRunner.query(
          `ALTER TABLE "refresh_tokens" ADD CONSTRAINT "FK_refresh_tokens_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE`,
        );
      }
    }

    if (!(await queryRunner.hasTable('otps'))) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "otps" (
          "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
          "userId" uuid NOT NULL,
          "codeHash" character varying(255) NOT NULL,
          "type" "otps_type_enum" NOT NULL,
          "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
          "usedAt" TIMESTAMP WITH TIME ZONE,
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          CONSTRAINT "PK_otps_id" PRIMARY KEY ("id")
        )
      `);
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "IDX_otps_userId_type" ON "otps" ("userId", "type")`,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "IDX_otps_userId_usedAt" ON "otps" ("userId", "usedAt")`,
      );
      if (hasUsers) {
        await queryRunner.query(
          `ALTER TABLE "otps" ADD CONSTRAINT "FK_otps_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE`,
        );
      }
    }

    if (!(await queryRunner.hasTable('backup_codes'))) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "backup_codes" (
          "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
          "userId" uuid NOT NULL,
          "codeHash" text NOT NULL,
          "consumedAt" TIMESTAMP WITH TIME ZONE,
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          CONSTRAINT "PK_backup_codes_id" PRIMARY KEY ("id")
        )
      `);
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "IDX_backup_codes_userId" ON "backup_codes" ("userId")`,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "IDX_backup_codes_userId_consumedAt" ON "backup_codes" ("userId", "consumedAt")`,
      );
      if (hasUsers) {
        await queryRunner.query(
          `ALTER TABLE "backup_codes" ADD CONSTRAINT "FK_backup_codes_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE`,
        );
      }
    }

    if (!(await queryRunner.hasTable('password_reset_attempts'))) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "password_reset_attempts" (
          "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
          "email" character varying(255) NOT NULL,
          "ipAddress" character varying(45),
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          CONSTRAINT "PK_password_reset_attempts_id" PRIMARY KEY ("id")
        )
      `);
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "IDX_password_reset_attempts_email" ON "password_reset_attempts" ("email")`,
      );
    }

    if (!(await queryRunner.hasTable('rate_limit_configs'))) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "rate_limit_configs" (
          "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
          "plan" "users_plan_enum" NOT NULL,
          "limitPerMinute" integer,
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          CONSTRAINT "PK_rate_limit_configs_id" PRIMARY KEY ("id"),
          CONSTRAINT "UQ_rate_limit_configs_plan" UNIQUE ("plan")
        )
      `);

      // One row per plan so the per-plan throttling has a baseline to read.
      await queryRunner.query(`
        INSERT INTO "rate_limit_configs" ("plan", "limitPerMinute")
        VALUES ('FREE', 60), ('BASIC', 120), ('PREMIUM', 300), ('ENTERPRISE', 600)
        ON CONFLICT ("plan") DO NOTHING
      `);
    }

    if (!(await queryRunner.hasTable('data_requests'))) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "data_requests" (
          "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
          "userId" uuid NOT NULL,
          "type" "data_requests_type_enum" NOT NULL,
          "status" "data_requests_status_enum" NOT NULL DEFAULT 'PENDING',
          "requestedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "completedAt" TIMESTAMP WITH TIME ZONE,
          "downloadUrl" character varying(500),
          "expiresAt" TIMESTAMP WITH TIME ZONE,
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          CONSTRAINT "PK_data_requests_id" PRIMARY KEY ("id")
        )
      `);
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "IDX_data_requests_userId" ON "data_requests" ("userId")`,
      );
      if (hasUsers) {
        await queryRunner.query(
          `ALTER TABLE "data_requests" ADD CONSTRAINT "FK_data_requests_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE`,
        );
      }
    }

    if (!(await queryRunner.hasTable('idempotency_records'))) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "idempotency_records" (
          "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
          "key" character varying(255) NOT NULL,
          "userId" uuid NOT NULL,
          "endpoint" character varying(255) NOT NULL,
          "requestHash" character(64) NOT NULL,
          "responseStatus" integer NOT NULL,
          "responseBody" jsonb NOT NULL,
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
          CONSTRAINT "PK_idempotency_records_id" PRIMARY KEY ("id")
        )
      `);
      await queryRunner.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_idempotency_records_key_userId" ON "idempotency_records" ("key", "userId")`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "idempotency_records"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "data_requests"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "rate_limit_configs"`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "password_reset_attempts"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "backup_codes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "otps"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "refresh_tokens"`);
  }
}