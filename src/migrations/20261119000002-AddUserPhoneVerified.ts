import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserPhoneVerified20261119000002 implements MigrationInterface {
  name = 'AddUserPhoneVerified20261119000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('users'))) {
      return;
    }

    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "isPhoneVerified" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('users'))) {
      return;
    }

    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "isPhoneVerified"`,
    );
  }
}
