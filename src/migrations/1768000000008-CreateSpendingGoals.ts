import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSpendingGoals1768000000008 implements MigrationInterface {
  name = 'CreateSpendingGoals1768000000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "spending_goals_period_enum" AS ENUM ('MONTHLY')
    `);

    await queryRunner.query(`
      CREATE TABLE "spending_goals" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "categoryId" uuid,
        "name" varchar(100) NOT NULL,
        "targetAmount" numeric(20,8) NOT NULL,
        "currency" varchar(10) NOT NULL,
        "period" "spending_goals_period_enum" NOT NULL DEFAULT 'MONTHLY',
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "FK_spending_goals_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_spending_goals_userId" ON "spending_goals" ("userId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_spending_goals_userId"`);
    await queryRunner.query(`DROP TABLE "spending_goals"`);
    await queryRunner.query(`DROP TYPE "spending_goals_period_enum"`);
  }
}
