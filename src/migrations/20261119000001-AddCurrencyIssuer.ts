import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCurrencyIssuer20261119000001 implements MigrationInterface {
  name = 'AddCurrencyIssuer20261119000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "currencies" ADD COLUMN IF NOT EXISTS "issuer" varchar(56) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "currencies" DROP COLUMN IF EXISTS "issuer"`,
    );
  }
}
