import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Drops the duplicated passwordHash column.
 *
 * `password` and `passwordHash` held the same bcrypt hash, but passwordHash
 * was declared NOT NULL by CreateUsersTable while OAuth signups create users
 * with no password at all - a first-time Google or GitHub login therefore
 * failed with a not-null violation, and the two columns could drift apart.
 */
export class DropPasswordHash20261017001000 implements MigrationInterface {
  name = 'DropPasswordHash20261017001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('users'))) {
      return;
    }

    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "passwordHash"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "password" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('users'))) {
      return;
    }

    await queryRunner.query(
      `UPDATE "users" SET "password" = '' WHERE "password" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "password" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "passwordHash" character varying(255)`,
    );
    await queryRunner.query(
      `UPDATE "users" SET "passwordHash" = "password" WHERE "passwordHash" IS NULL`,
    );
  }
}