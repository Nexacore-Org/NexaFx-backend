import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDashboardPreferences1784000001000
  implements MigrationInterface
{
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "dashboard_preferences" (
        "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
        "userId" UUID NOT NULL,
        "layout" jsonb NOT NULL DEFAULT '[]',
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_dashboard_preferences" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_dashboard_preferences_userId" UNIQUE ("userId")
      );
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "dashboard_preferences";`);
  }
}