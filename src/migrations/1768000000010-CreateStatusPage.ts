import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateStatusPage1768000000010 implements MigrationInterface {
  name = 'CreateStatusPage1768000000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "status_components_status_enum" AS ENUM (
        'OPERATIONAL', 'DEGRADED', 'PARTIAL_OUTAGE', 'MAJOR_OUTAGE'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "status_incidents_severity_enum" AS ENUM (
        'MINOR', 'MAJOR', 'CRITICAL'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "status_incidents_status_enum" AS ENUM (
        'INVESTIGATING', 'IDENTIFIED', 'MONITORING', 'RESOLVED'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "status_components" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(100) NOT NULL,
        "slug" character varying(100) NOT NULL,
        "status" "status_components_status_enum" NOT NULL DEFAULT 'OPERATIONAL',
        "uptimePercent90d" numeric(5,2) NOT NULL DEFAULT '100.00',
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_status_components_slug" UNIQUE ("slug"),
        CONSTRAINT "PK_status_components" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "status_incidents" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "title" character varying(200) NOT NULL,
        "body" text NOT NULL,
        "severity" "status_incidents_severity_enum" NOT NULL,
        "status" "status_incidents_status_enum" NOT NULL DEFAULT 'INVESTIGATING',
        "affectedComponents" text,
        "startedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "resolvedAt" TIMESTAMP WITH TIME ZONE,
        "createdBy" uuid,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_status_incidents" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "status_incidents"`);
    await queryRunner.query(`DROP TABLE "status_components"`);
    await queryRunner.query(`DROP TYPE "status_incidents_status_enum"`);
    await queryRunner.query(`DROP TYPE "status_incidents_severity_enum"`);
    await queryRunner.query(`DROP TYPE "status_components_status_enum"`);
  }
}
