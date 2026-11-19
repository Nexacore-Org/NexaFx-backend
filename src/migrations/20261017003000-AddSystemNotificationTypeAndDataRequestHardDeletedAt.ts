import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSystemNotificationTypeAndDataRequestHardDeletedAt20261017003000
  implements MigrationInterface
{
  name = 'AddSystemNotificationTypeAndDataRequestHardDeletedAt20261017003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notifications_type_enum') THEN
          ALTER TYPE "public"."notifications_type_enum" ADD VALUE IF NOT EXISTS 'SYSTEM';
        END IF;
      END
      $$;
    `);

    if (await queryRunner.hasTable('data_requests')) {
      await queryRunner.query(`
        ALTER TABLE "data_requests"
        ADD COLUMN IF NOT EXISTS "hardDeletedAt" TIMESTAMP WITH TIME ZONE
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('data_requests')) {
      await queryRunner.query(`
        ALTER TABLE "data_requests"
        DROP COLUMN IF EXISTS "hardDeletedAt"
      `);
    }
  }
}
