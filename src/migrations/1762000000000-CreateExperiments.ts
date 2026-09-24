import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateExperiments1762000000000 implements MigrationInterface {
  name = 'CreateExperiments1762000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."experiments_status_enum" AS ENUM(
        'DRAFT',
        'RUNNING',
        'PAUSED',
        'CONCLUDED'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "experiments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "key" character varying(255) NOT NULL,
        "name" character varying(255) NOT NULL,
        "description" text,
        "status" "public"."experiments_status_enum" NOT NULL DEFAULT 'DRAFT',
        "trafficPercent" integer NOT NULL DEFAULT 100,
        "startAt" TIMESTAMP WITH TIME ZONE,
        "endAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_experiments_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_experiments_key" UNIQUE ("key")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_experiments_key" ON "experiments" ("key")
    `);

    await queryRunner.query(`
      CREATE TABLE "experiment_variants" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "experimentId" uuid NOT NULL,
        "key" character varying(255) NOT NULL,
        "name" character varying(255) NOT NULL,
        "weight" integer NOT NULL DEFAULT 50,
        "config" jsonb DEFAULT '{}',
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_experiment_variants_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_experiment_variants_experiment_key" UNIQUE ("experimentId", "key"),
        CONSTRAINT "FK_experiment_variants_experiment" FOREIGN KEY ("experimentId")
          REFERENCES "experiments"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_experiment_variants_experimentId" ON "experiment_variants" ("experimentId")
    `);

    await queryRunner.query(`
      CREATE TABLE "experiment_assignments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "experimentId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "variantId" uuid NOT NULL,
        "assignedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_experiment_assignments_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_experiment_assignments_experiment_user" UNIQUE ("experimentId", "userId"),
        CONSTRAINT "FK_experiment_assignments_experiment" FOREIGN KEY ("experimentId")
          REFERENCES "experiments"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_experiment_assignments_variant" FOREIGN KEY ("variantId")
          REFERENCES "experiment_variants"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_experiment_assignments_experimentId" ON "experiment_assignments" ("experimentId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_experiment_assignments_userId" ON "experiment_assignments" ("userId")
    `);

    await queryRunner.query(`
      CREATE TABLE "experiment_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "experimentId" uuid NOT NULL,
        "assignmentId" uuid NOT NULL,
        "eventName" character varying(255) NOT NULL,
        "metadata" jsonb,
        "occurredAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_experiment_events_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_experiment_events_experiment" FOREIGN KEY ("experimentId")
          REFERENCES "experiments"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_experiment_events_assignment" FOREIGN KEY ("assignmentId")
          REFERENCES "experiment_assignments"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_experiment_events_experiment_event" ON "experiment_events" ("experimentId", "eventName")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_experiment_events_assignmentId" ON "experiment_events" ("assignmentId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "experiment_events"');
    await queryRunner.query('DROP TABLE "experiment_assignments"');
    await queryRunner.query('DROP TABLE "experiment_variants"');
    await queryRunner.query('DROP TABLE "experiments"');
    await queryRunner.query('DROP TYPE "public"."experiments_status_enum"');
  }
}
