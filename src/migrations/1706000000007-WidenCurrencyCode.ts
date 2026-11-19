import { MigrationInterface, QueryRunner } from 'typeorm';

export class WidenCurrencyCode1706000000007 implements MigrationInterface {
  name = 'WidenCurrencyCode1706000000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('currencies', 'code')) {
      await queryRunner.query(`
        ALTER TABLE "currencies"
        ALTER COLUMN "code" TYPE varchar(10)
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    return;
  }
}
