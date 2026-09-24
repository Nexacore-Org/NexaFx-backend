import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOrganisations1765000000000 implements MigrationInterface {
  name = 'CreateOrganisations1765000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "organisations" (
        "id"                     uuid              NOT NULL DEFAULT uuid_generate_v4(),
        "name"                   character varying NOT NULL,
        "description"            character varying,
        "walletPublicKey"        character varying NOT NULL,
        "walletSecretKeyEncrypted" text            NOT NULL,
        "balances"               jsonb             NOT NULL DEFAULT '{}',
        "txLimitPerDay"          numeric(18,6)     NOT NULL DEFAULT 10000,
        "txLimitPerTx"           numeric(18,6)     NOT NULL DEFAULT 1000,
        "ownerId"                uuid              NOT NULL,
        "createdAt"              TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"              TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_organisations" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_organisations_name" UNIQUE ("name"),
        CONSTRAINT "FK_organisations_owner" FOREIGN KEY ("ownerId")
          REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_organisations_name" ON "organisations" ("name")
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."organisation_members_role_enum" AS ENUM ('OWNER', 'ADMIN', 'MEMBER')
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."organisation_members_invitestatus_enum" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED')
    `);

    await queryRunner.query(`
      CREATE TABLE "organisation_members" (
        "id"                   uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organisationId"       uuid NOT NULL,
        "userId"               uuid,
        "inviteEmail"          character varying NOT NULL,
        "role"                 "public"."organisation_members_role_enum" NOT NULL DEFAULT 'MEMBER',
        "inviteStatus"         "public"."organisation_members_invitestatus_enum" NOT NULL DEFAULT 'PENDING',
        "inviteToken"          uuid,
        "inviteTokenExpiresAt" timestamp,
        "joinedAt"             timestamp,
        "createdAt"            TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"            TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_organisation_members" PRIMARY KEY ("id"),
        CONSTRAINT "FK_organisation_members_org" FOREIGN KEY ("organisationId")
          REFERENCES "organisations"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_organisation_members_user" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_org_members_org_user"
        ON "organisation_members" ("organisationId", "userId")
        WHERE "userId" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_org_members_invite_token"
        ON "organisation_members" ("inviteToken")
        WHERE "inviteToken" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_org_members_invite_token"`);
    await queryRunner.query(`DROP INDEX "IDX_org_members_org_user"`);
    await queryRunner.query(`DROP TABLE "organisation_members"`);
    await queryRunner.query(`DROP TYPE "public"."organisation_members_invitestatus_enum"`);
    await queryRunner.query(`DROP TYPE "public"."organisation_members_role_enum"`);
    await queryRunner.query(`DROP INDEX "IDX_organisations_name"`);
    await queryRunner.query(`DROP TABLE "organisations"`);
  }
}
