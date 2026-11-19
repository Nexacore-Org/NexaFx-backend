import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStellarTxHashToTransactions20261119000000
  implements MigrationInterface
{
  name = 'AddStellarTxHashToTransactions20261119000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "stellarTxHash" varchar(255) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP COLUMN IF EXISTS "stellarTxHash"`,
    );
  }
}
