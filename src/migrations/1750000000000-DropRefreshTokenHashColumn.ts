import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Drops the refreshTokenHash column from the users table.
 * Refresh tokens are now stored exclusively in Redis.
 */
export class DropRefreshTokenHashColumn1750000000000
  implements MigrationInterface
{
  name = 'DropRefreshTokenHashColumn1750000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "refreshTokenHash"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "refreshTokenHash" varchar(255) NULL`,
    );
  }
}