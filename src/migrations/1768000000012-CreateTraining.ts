import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTraining1768000000012 implements MigrationInterface {
  name = 'CreateTraining1768000000012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "staff_training_records_status_enum" AS ENUM (
        'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'EXPIRED'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "training_modules" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "title" character varying(200) NOT NULL,
        "description" text NOT NULL,
        "durationMinutes" integer NOT NULL,
        "isRequired" boolean NOT NULL DEFAULT false,
        "validityMonths" integer NOT NULL DEFAULT 12,
        "targetRoles" text,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_training_modules" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "staff_training_records" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "moduleId" uuid NOT NULL,
        "status" "staff_training_records_status_enum" NOT NULL DEFAULT 'ASSIGNED',
        "assignedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "completedAt" TIMESTAMP WITH TIME ZONE,
        "expiresAt" TIMESTAMP WITH TIME ZONE,
        "score" integer,
        "attempts" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_staff_training_records" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "staff_training_records"
      ADD CONSTRAINT "FK_staff_training_records_moduleId"
      FOREIGN KEY ("moduleId") REFERENCES "training_modules"("id") ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "staff_training_records" DROP CONSTRAINT "FK_staff_training_records_moduleId"`,
    );
    await queryRunner.query(`DROP TABLE "staff_training_records"`);
    await queryRunner.query(`DROP TABLE "training_modules"`);
    await queryRunner.query(`DROP TYPE "staff_training_records_status_enum"`);
  }
}
