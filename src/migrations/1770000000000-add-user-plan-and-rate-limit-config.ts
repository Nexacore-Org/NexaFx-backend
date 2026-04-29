import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserPlanAndRateLimitConfig1770000000000 implements MigrationInterface {
  name = 'AddUserPlanAndRateLimitConfig1770000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create UserPlan enum type
    await queryRunner.query(
      `CREATE TYPE "public"."users_plan_enum" AS ENUM('FREE', 'BASIC', 'PREMIUM', 'ENTERPRISE')`,
    );

    // Add plan column to users table
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "plan" "public"."users_plan_enum" NOT NULL DEFAULT 'FREE'`,
    );

    // Create rate_limit_configs table
    await queryRunner.query(
      `CREATE TABLE "rate_limit_configs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "plan" "public"."users_plan_enum" NOT NULL, "limitPerMinute" integer, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_rate_limit_configs_id" PRIMARY KEY ("id"))`,
    );

    // Add unique constraint on plan
    await queryRunner.query(
      `ALTER TABLE "rate_limit_configs" ADD CONSTRAINT "UQ_rate_limit_configs_plan" UNIQUE ("plan")`,
    );

    // Insert default rate limit configurations
    await queryRunner.query(
      `INSERT INTO "rate_limit_configs" ("plan", "limitPerMinute") VALUES ('FREE', 60), ('BASIC', 200), ('PREMIUM', 1000), ('ENTERPRISE', NULL)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove plan column
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "plan"`);

    // Drop rate_limit_configs table
    await queryRunner.query(`DROP TABLE "rate_limit_configs"`);

    // Drop UserPlan enum type
    await queryRunner.query(`DROP TYPE "public"."users_plan_enum"`);
  }
}
