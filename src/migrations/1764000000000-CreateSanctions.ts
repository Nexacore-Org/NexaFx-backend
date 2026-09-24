import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSanctions1764000000000 implements MigrationInterface {
  name = 'CreateSanctions1764000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."kyc_screenings_status_enum" AS ENUM ('CLEAR', 'WARNING', 'BLOCKED')
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."kyc_screenings_provider_enum" AS ENUM ('OPEN_SANCTIONS', 'OFAC')
    `);

    await queryRunner.query(`
      CREATE TABLE "kyc_screenings" (
        "id"             uuid              NOT NULL DEFAULT uuid_generate_v4(),
        "userId"         uuid              NOT NULL,
        "fullName"       character varying NOT NULL,
        "dateOfBirth"    date,
        "nationality"    character varying,
        "score"          integer           NOT NULL DEFAULT 0,
        "status"         "public"."kyc_screenings_status_enum" NOT NULL DEFAULT 'CLEAR',
        "provider"       "public"."kyc_screenings_provider_enum" NOT NULL,
        "matches"        jsonb             NOT NULL DEFAULT '[]',
        "overriddenBy"   uuid,
        "overrideReason" character varying,
        "overriddenAt"   timestamp,
        "createdAt"      TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"      TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_kyc_screenings" PRIMARY KEY ("id"),
        CONSTRAINT "FK_kyc_screenings_user" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_kyc_screenings_userId_createdAt"
        ON "kyc_screenings" ("userId", "createdAt")
    `);

    await queryRunner.query(`
      CREATE TABLE "ofac_entries" (
        "id"                     uuid NOT NULL DEFAULT uuid_generate_v4(),
        "sdnName"                character varying NOT NULL,
        "normalizedName"         character varying NOT NULL,
        "sdnType"                character varying,
        "program"                character varying,
        "title"                  character varying,
        "callSign"               character varying,
        "vesselType"             character varying,
        "tonnage"                character varying,
        "grossRegisteredTonnage" character varying,
        "vesselFlag"             character varying,
        "vesselOwner"            character varying,
        "remarks"                character varying,
        "aliases"                jsonb NOT NULL DEFAULT '[]',
        "createdAt"              TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ofac_entries" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_ofac_entries_normalizedName"
        ON "ofac_entries" ("normalizedName")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_ofac_entries_normalizedName"`);
    await queryRunner.query(`DROP TABLE "ofac_entries"`);
    await queryRunner.query(`DROP INDEX "IDX_kyc_screenings_userId_createdAt"`);
    await queryRunner.query(`DROP TABLE "kyc_screenings"`);
    await queryRunner.query(`DROP TYPE "public"."kyc_screenings_provider_enum"`);
    await queryRunner.query(`DROP TYPE "public"."kyc_screenings_status_enum"`);
  }
}
