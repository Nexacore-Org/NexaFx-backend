import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixFeeConfigEnumsAndDefaults20261015000000
  implements MigrationInterface
{
  name = 'FixFeeConfigEnumsAndDefaults20261015000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('fee_configs'))) {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "fee_configs"
        ALTER COLUMN "transactionType" DROP DEFAULT,
        ALTER COLUMN "feeType" DROP DEFAULT,
        ALTER COLUMN "transactionType" TYPE varchar(50)
          USING "transactionType"::text,
        ALTER COLUMN "feeType" TYPE varchar(20)
          USING "feeType"::text
    `);

    await queryRunner.query(`
      DELETE FROM "fee_configs"
      WHERE "transactionType" NOT IN ('DEPOSIT', 'WITHDRAW', 'CONVERT', 'SWAP')
         OR "feeType" NOT IN ('FLAT', 'PERCENTAGE')
    `);

    await queryRunner.query(
      'DROP TYPE IF EXISTS "fee_configs_transactiontype_enum"',
    );
    await queryRunner.query('DROP TYPE IF EXISTS "fee_configs_feetype_enum"');
    await queryRunner.query(`
      CREATE TYPE "fee_configs_transactiontype_enum" AS ENUM (
        'DEPOSIT', 'WITHDRAW', 'CONVERT', 'SWAP'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "fee_configs_feetype_enum" AS ENUM (
        'FLAT', 'PERCENTAGE'
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "fee_configs"
        ALTER COLUMN "transactionType"
          TYPE "fee_configs_transactiontype_enum"
          USING "transactionType"::"fee_configs_transactiontype_enum",
        ALTER COLUMN "feeType"
          TYPE "fee_configs_feetype_enum"
          USING "feeType"::"fee_configs_feetype_enum"
    `);

    await queryRunner.query(`
      INSERT INTO "fee_configs"
        ("transactionType", "currency", "feeType", "feeValue", "minFee", "maxFee", "isActive")
      SELECT 'DEPOSIT', '*', 'FLAT', 0.50000000, NULL, NULL, true
      WHERE NOT EXISTS (
        SELECT 1 FROM "fee_configs"
        WHERE "transactionType" = 'DEPOSIT' AND "currency" = '*'
      )
    `);
    await queryRunner.query(`
      INSERT INTO "fee_configs"
        ("transactionType", "currency", "feeType", "feeValue", "minFee", "maxFee", "isActive")
      SELECT 'WITHDRAW', '*', 'PERCENTAGE', 0.50000000, 0.10000000, 50.00000000, true
      WHERE NOT EXISTS (
        SELECT 1 FROM "fee_configs"
        WHERE "transactionType" = 'WITHDRAW' AND "currency" = '*'
      )
    `);
    await queryRunner.query(`
      INSERT INTO "fee_configs"
        ("transactionType", "currency", "feeType", "feeValue", "minFee", "maxFee", "isActive")
      SELECT 'CONVERT', '*', 'PERCENTAGE', 0.25000000, 0.05000000, 25.00000000, true
      WHERE NOT EXISTS (
        SELECT 1 FROM "fee_configs"
        WHERE "transactionType" = 'CONVERT' AND "currency" = '*'
      )
    `);
    await queryRunner.query(`
      INSERT INTO "fee_configs"
        ("transactionType", "currency", "feeType", "feeValue", "minFee", "maxFee", "isActive")
      SELECT 'SWAP', '*', 'PERCENTAGE', 0.25000000, 0.05000000, 25.00000000, true
      WHERE NOT EXISTS (
        SELECT 1 FROM "fee_configs"
        WHERE "transactionType" = 'SWAP' AND "currency" = '*'
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('fee_configs'))) {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "fee_configs"
        ALTER COLUMN "transactionType" TYPE varchar(50)
          USING "transactionType"::text,
        ALTER COLUMN "feeType" TYPE varchar(20)
          USING "feeType"::text,
        ALTER COLUMN "feeType" SET DEFAULT 'PERCENT'
    `);
    await queryRunner.query(
      'DROP TYPE IF EXISTS "fee_configs_transactiontype_enum"',
    );
    await queryRunner.query('DROP TYPE IF EXISTS "fee_configs_feetype_enum"');
  }
}
