import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOAuthAccounts1762000000000 implements MigrationInterface {
  name = 'CreateOAuthAccounts1762000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('users'))) {
      return;
    }

    // Make password nullable for OAuth-only users
    await queryRunner.query(`
      ALTER TABLE "users" ALTER COLUMN "password" DROP NOT NULL
    `);

    // Create OAuth provider enum type
    await queryRunner.query(`
      CREATE TYPE "public"."oauth_provider_enum" AS ENUM('GOOGLE', 'GITHUB')
    `);

    // Create oauth_accounts table
    await queryRunner.query(`
      CREATE TABLE "oauth_accounts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "provider" "public"."oauth_provider_enum" NOT NULL,
        "providerAccountId" character varying(255) NOT NULL,
        "accessToken" text,
        "refreshToken" text,
        "profile" jsonb,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_oauth_accounts_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_oauth_provider_account" UNIQUE ("provider", "providerAccountId"),
        CONSTRAINT "FK_oauth_accounts_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // Create indices
    await queryRunner.query(`
      CREATE INDEX "IDX_oauth_accounts_userId" ON "oauth_accounts" ("userId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('oauth_accounts'))) {
      return;
    }

    await queryRunner.query('DROP INDEX "IDX_oauth_accounts_userId"');
    await queryRunner.query('DROP TABLE "oauth_accounts"');
    await queryRunner.query('DROP TYPE "public"."oauth_provider_enum"');

    await queryRunner.query(`
      ALTER TABLE "users" ALTER COLUMN "password" SET NOT NULL
    `);
  }
}
