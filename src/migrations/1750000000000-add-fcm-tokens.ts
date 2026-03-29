import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFcmTokens1750000000000 implements MigrationInterface {
  name = 'AddFcmTokens1750000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "fcmTokens" jsonb DEFAULT '[]'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "fcmTokens"`);
  }
}
