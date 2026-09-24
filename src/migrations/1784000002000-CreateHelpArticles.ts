import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateHelpArticles1784000002000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "help_articles" (
        "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
        "slug" varchar(200) NOT NULL,
        "title" varchar(200) NOT NULL,
        "body" text NOT NULL,
        "category" varchar(100) NOT NULL,
        "tags" text[] NOT NULL DEFAULT '{}',
        "isPublished" boolean NOT NULL DEFAULT false,
        "viewCount" integer NOT NULL DEFAULT 0,
        "helpfulCount" integer NOT NULL DEFAULT 0,
        "notHelpfulCount" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_help_articles" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_help_articles_slug" UNIQUE ("slug")
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_help_articles_isPublished_category"
        ON "help_articles" ("isPublished", "category");
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "help_articles";`);
  }
}