import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRateAlerts1762000000000 implements MigrationInterface {
  name = 'CreateRateAlerts1762000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."rate_alerts_condition_enum" AS ENUM ('above', 'below')
    `);

    await queryRunner.query(`
      CREATE TABLE "rate_alerts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "fromCurrency" character varying(10) NOT NULL,
        "toCurrency" character varying(10) NOT NULL,
        "targetRate" numeric(20,8) NOT NULL,
        "condition" "public"."rate_alerts_condition_enum" NOT NULL,
        "isActive" boolean NOT NULL DEFAULT true,
        "recurring" boolean NOT NULL DEFAULT false,
        "triggeredAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_rate_alerts_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_rate_alerts_userId" ON "rate_alerts" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_rate_alerts_fromCurrency" ON "rate_alerts" ("fromCurrency")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_rate_alerts_toCurrency" ON "rate_alerts" ("toCurrency")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_rate_alerts_isActive" ON "rate_alerts" ("isActive")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_rate_alerts_isActive"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_rate_alerts_toCurrency"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_rate_alerts_fromCurrency"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_rate_alerts_userId"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "rate_alerts"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."rate_alerts_condition_enum"`,
    );
  }
}
