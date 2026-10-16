import { MigrationInterface, QueryRunner } from 'typeorm';

export class WidenLoanInterestRate20261016000000 implements MigrationInterface {
  name = 'WidenLoanInterestRate20261016000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "loan_applications"
      ALTER COLUMN "interestRatePercent" TYPE numeric(7,4)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "loan_applications"
      ALTER COLUMN "interestRatePercent" TYPE numeric(5,4)
    `);
  }
}
