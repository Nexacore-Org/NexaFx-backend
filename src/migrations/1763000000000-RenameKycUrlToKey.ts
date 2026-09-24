import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameKycUrlToKey1763000000000 implements MigrationInterface {
  name = 'RenameKycUrlToKey1763000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "kyc_records" RENAME COLUMN "documentFrontUrl" TO "documentFrontKey"
    `);
    await queryRunner.query(`
      ALTER TABLE "kyc_records" RENAME COLUMN "documentBackUrl" TO "documentBackKey"
    `);
    await queryRunner.query(`
      ALTER TABLE "kyc_records" RENAME COLUMN "selfieUrl" TO "selfieKey"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "kyc_records" RENAME COLUMN "documentFrontKey" TO "documentFrontUrl"
    `);
    await queryRunner.query(`
      ALTER TABLE "kyc_records" RENAME COLUMN "documentBackKey" TO "documentBackUrl"
    `);
    await queryRunner.query(`
      ALTER TABLE "kyc_records" RENAME COLUMN "selfieKey" TO "selfieUrl"
    `);
  }
}
