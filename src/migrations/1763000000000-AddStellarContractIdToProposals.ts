import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStellarContractIdToProposals1763000000000 implements MigrationInterface {
  name = 'AddStellarContractIdToProposals1763000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "proposals"
      ADD COLUMN IF NOT EXISTS "stellarContractId" varchar(128)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "proposals"
      DROP COLUMN IF EXISTS "stellarContractId"
    `);
  }
}
