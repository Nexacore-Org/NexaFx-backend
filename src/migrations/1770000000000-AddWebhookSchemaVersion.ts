import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds WebhookEndpoint.preferredSchemaVersion.
 *
 * Endpoints that already exist are backfilled to '1.0' — they were registered
 * against the v1 payload shape, so silently promoting them to v2 would be a
 * breaking change. New endpoints pick up the '2.0' column default.
 */
export class AddWebhookSchemaVersion1770000000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(
      `SELECT to_regclass('public.webhook_endpoints') IS NOT NULL AS present`,
    )) as Array<{ present: boolean }>;
    if (!rows[0]?.present) return;

    await queryRunner.query(`
      ALTER TABLE "webhook_endpoints"
        ADD COLUMN IF NOT EXISTS "preferredSchemaVersion" varchar(10);
    `);

    await queryRunner.query(`
      UPDATE "webhook_endpoints"
        SET "preferredSchemaVersion" = '1.0'
        WHERE "preferredSchemaVersion" IS NULL;
    `);

    await queryRunner.query(`
      ALTER TABLE "webhook_endpoints"
        ALTER COLUMN "preferredSchemaVersion" SET DEFAULT '2.0';
    `);

    await queryRunner.query(`
      ALTER TABLE "webhook_endpoints"
        ALTER COLUMN "preferredSchemaVersion" SET NOT NULL;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE IF EXISTS "webhook_endpoints"
        DROP COLUMN IF EXISTS "preferredSchemaVersion";
    `);
  }
}
