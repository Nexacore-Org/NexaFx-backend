import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the webhook_endpoints, webhook_deliveries, push_notifications, and
 * sms_provider_routes tables matching their TypeORM entities (#1510 / #1292).
 */
export class CreateWebhookPushAndSmsTables1769000000000 implements MigrationInterface {
  name = 'CreateWebhookPushAndSmsTables1769000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    if (!(await queryRunner.hasTable('webhook_endpoints'))) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "webhook_endpoints" (
          "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
          "userId" character varying NOT NULL,
          "url" character varying NOT NULL,
          "secret" character varying NOT NULL,
          "previousSecret" character varying,
          "previousSecretExpiresAt" TIMESTAMP WITH TIME ZONE,
          "events" text array NOT NULL,
          "isActive" boolean NOT NULL DEFAULT true,
          "preferredSchemaVersion" character varying(10) NOT NULL DEFAULT '2.0',
          "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
          "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
          CONSTRAINT "PK_webhook_endpoints_id" PRIMARY KEY ("id")
        )
      `);
    } else {
      await queryRunner.query(`
        ALTER TABLE "webhook_endpoints"
          ADD COLUMN IF NOT EXISTS "previousSecret" character varying,
          ADD COLUMN IF NOT EXISTS "previousSecretExpiresAt" TIMESTAMP WITH TIME ZONE,
          ADD COLUMN IF NOT EXISTS "preferredSchemaVersion" character varying(10) NOT NULL DEFAULT '2.0'
      `);
    }

    if (!(await queryRunner.hasTable('webhook_deliveries'))) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "webhook_deliveries" (
          "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
          "endpointId" character varying NOT NULL,
          "eventType" character varying NOT NULL,
          "payload" jsonb NOT NULL,
          "responseStatus" integer,
          "responseBody" text,
          "attemptCount" integer NOT NULL DEFAULT 0,
          "nextRetryAt" TIMESTAMP,
          "deliveredAt" TIMESTAMP,
          "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
          CONSTRAINT "PK_webhook_deliveries_id" PRIMARY KEY ("id")
        )
      `);
    }
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_webhook_deliveries_endpointId" ON "webhook_deliveries" ("endpointId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_webhook_deliveries_nextRetryAt" ON "webhook_deliveries" ("nextRetryAt")`,
    );

    await queryRunner.query(
      `DO $$ BEGIN CREATE TYPE "public"."push_notifications_status_enum" AS ENUM ('ACTIVE', 'INACTIVE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    );

    if (!(await queryRunner.hasTable('push_notifications'))) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "push_notifications" (
          "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
          "title" character varying(255) NOT NULL,
          "message" text NOT NULL,
          "status" "public"."push_notifications_status_enum" NOT NULL DEFAULT 'ACTIVE',
          "sentBy" uuid NOT NULL,
          "recipientCount" integer NOT NULL DEFAULT 0,
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          CONSTRAINT "PK_push_notifications_id" PRIMARY KEY ("id")
        )
      `);
    }
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_push_notifications_status_createdAt" ON "push_notifications" ("status", "createdAt")`,
    );

    if (!(await queryRunner.hasTable('sms_provider_routes'))) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "sms_provider_routes" (
          "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
          "countryCode" character varying(10) NOT NULL,
          "providerName" character varying(100) NOT NULL,
          "priority" integer NOT NULL DEFAULT 0,
          "isActive" boolean NOT NULL DEFAULT true,
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          CONSTRAINT "PK_sms_provider_routes_id" PRIMARY KEY ("id")
        )
      `);
    }
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_sms_provider_routes_countryCode" ON "sms_provider_routes" ("countryCode")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_sms_provider_routes_countryCode"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "sms_provider_routes"`);

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_push_notifications_status_createdAt"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "push_notifications"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."push_notifications_status_enum"`,
    );

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_webhook_deliveries_nextRetryAt"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_webhook_deliveries_endpointId"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "webhook_deliveries"`);

    await queryRunner.query(`DROP TABLE IF EXISTS "webhook_endpoints"`);
  }
}
