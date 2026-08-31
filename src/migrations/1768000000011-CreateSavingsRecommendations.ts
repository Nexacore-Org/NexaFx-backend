import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSavingsRecommendations1768000000011 implements MigrationInterface {
  name = 'CreateSavingsRecommendations1768000000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "savings_recommendations_type_enum" AS ENUM (
        'VAULT_CONTRIBUTION', 'RECURRING_SETUP', 'VAULT_DURATION', 'TOPUP_REDUCTION'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "savings_recommendations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "type" "savings_recommendations_type_enum" NOT NULL,
        "title" character varying(200) NOT NULL,
        "body" text NOT NULL,
        "potentialSavingsXlm" numeric(20,8),
        "actionDeepLink" character varying(500),
        "isActedOn" boolean NOT NULL DEFAULT false,
        "generatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_savings_recommendations" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "savings_recommendations"
      ADD CONSTRAINT "FK_savings_recommendations_userId"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "savings_recommendations" DROP CONSTRAINT "FK_savings_recommendations_userId"`,
    );
    await queryRunner.query(`DROP TABLE "savings_recommendations"`);
    await queryRunner.query(`DROP TYPE "savings_recommendations_type_enum"`);
  }
}
