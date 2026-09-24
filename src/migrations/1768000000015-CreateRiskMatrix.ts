import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRiskMatrix1768000000015 implements MigrationInterface {
  name = 'CreateRiskMatrix1768000000015';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "risk_rating_enum" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH')
    `);

    await queryRunner.query(`
      CREATE TABLE "customer_risk_ratings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "rating" "risk_rating_enum" NOT NULL DEFAULT 'LOW',
        "score" integer NOT NULL DEFAULT 0,
        "factors" jsonb NOT NULL DEFAULT '{}',
        "lastAssessedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "nextAssessmentDue" TIMESTAMP WITH TIME ZONE NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_customer_risk_ratings" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_customer_risk_ratings_userId" UNIQUE ("userId")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "customer_risk_ratings"`);
    await queryRunner.query(`DROP TYPE "risk_rating_enum"`);
  }
}
