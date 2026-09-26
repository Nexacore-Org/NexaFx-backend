import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateV2Tables1772000000000 implements MigrationInterface {
  name = 'CreateV2Tables1772000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "v2_organizations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL,
        "slug" character varying NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_v2_organizations" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_v2_organizations_slug" UNIQUE ("slug")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "v2_projects" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" uuid NOT NULL,
        "name" character varying NOT NULL,
        "status" character varying NOT NULL DEFAULT 'active',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_v2_projects" PRIMARY KEY ("id"),
        CONSTRAINT "FK_v2_projects_organization" FOREIGN KEY ("organization_id")
          REFERENCES "v2_organizations"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "v2_project_members" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "project_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "role" character varying NOT NULL DEFAULT 'member',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_v2_project_members" PRIMARY KEY ("id"),
        CONSTRAINT "FK_v2_project_members_project" FOREIGN KEY ("project_id")
          REFERENCES "v2_projects"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_v2_projects_organization_id"
        ON "v2_projects" ("organization_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_v2_project_members_project_id"
        ON "v2_project_members" ("project_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_v2_project_members_project_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_v2_projects_organization_id"`);

    await queryRunner.query(`DROP TABLE IF EXISTS "v2_project_members"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "v2_projects"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "v2_organizations"`);
  }
}
