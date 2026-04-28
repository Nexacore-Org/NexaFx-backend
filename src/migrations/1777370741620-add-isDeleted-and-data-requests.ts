import { MigrationInterface, QueryRunner } from "typeorm";

export class AddIsDeletedAndDataRequests1777370741620 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add isDeleted column to users table
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "isDeleted" boolean NOT NULL DEFAULT false
    `);

    // Create data_requests table
    await queryRunner.query(`
      CREATE TABLE "data_requests" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "type" VARCHAR NOT NULL,
        "status" VARCHAR NOT NULL DEFAULT 'PENDING',
        "requestedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "completedAt" TIMESTAMP WITH TIME ZONE,
        "downloadUrl" VARCHAR(500),
        "expiresAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_data_requests_id" PRIMARY KEY ("id")
      )
    `);

    // Add indexes
    await queryRunner.query(`
      CREATE INDEX "IDX_users_isDeleted" ON "users" ("isDeleted")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_data_requests_userId" ON "data_requests" ("userId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_data_requests_type" ON "data_requests" ("type")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_data_requests_status" ON "data_requests" ("status")
    `);

    // Add foreign key
    await queryRunner.query(`
      ALTER TABLE "data_requests"
      ADD CONSTRAINT "FK_data_requests_userId"
      FOREIGN KEY ("userId")
      REFERENCES "users"("id")
      ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign key
    await queryRunner.query(`
      ALTER TABLE "data_requests"
      DROP CONSTRAINT "FK_data_requests_userId"
    `);

    // Drop indexes
    await queryRunner.query(`
      DROP INDEX "IDX_data_requests_status"
    `);

    await queryRunner.query(`
      DROP INDEX "IDX_data_requests_type"
    `);

    await queryRunner.query(`
      DROP INDEX "IDX_data_requests_userId"
    `);

    await queryRunner.query(`
      DROP INDEX "IDX_users_isDeleted"
    `);

    // Drop table
    await queryRunner.query(`
      DROP TABLE "data_requests"
    `);

    // Drop column
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN "isDeleted"
    `);
  }
}
