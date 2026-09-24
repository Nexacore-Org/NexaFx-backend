import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateContentModerationEvents1768000000001
  implements MigrationInterface
{
  name = 'CreateContentModerationEvents1768000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."content_moderation_events_action_enum" AS ENUM (
        'ALLOWED', 'STRIPPED', 'REJECTED', 'FLAGGED_FOR_REVIEW'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "content_moderation_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "context" character varying(100) NOT NULL,
        "originalText" text,
        "flags" text[] NOT NULL DEFAULT '{}',
        "action" "public"."content_moderation_events_action_enum" NOT NULL DEFAULT 'ALLOWED',
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_content_moderation_events_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_content_moderation_events_user"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_content_moderation_events_userId"
      ON "content_moderation_events" ("userId")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_content_moderation_events_action"
      ON "content_moderation_events" ("action")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_content_moderation_events_createdAt"
      ON "content_moderation_events" ("createdAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_content_moderation_events_createdAt"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_content_moderation_events_action"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_content_moderation_events_userId"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "content_moderation_events"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."content_moderation_events_action_enum"`,
    );
  }
}
