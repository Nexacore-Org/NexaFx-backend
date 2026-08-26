import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserPreferredLanguage1766000000000 implements MigrationInterface {
  name = 'AddUserPreferredLanguage1766000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "preferredLanguage" character varying(10) NOT NULL DEFAULT 'en'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "preferredLanguage"
    `);
  }
}
