import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSandbox1768000000006 implements MigrationInterface {
  name = 'CreateSandbox1768000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "sandbox_accounts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "sandboxApiKey" character varying(255) NOT NULL,
        "resetCount" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_sandbox_accounts_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_sandbox_accounts_sandboxApiKey" UNIQUE ("sandboxApiKey"),
        CONSTRAINT "FK_sandbox_accounts_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "sandbox_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "sandboxAccountId" uuid NOT NULL,
        "eventType" character varying(100) NOT NULL,
        "data" jsonb NOT NULL DEFAULT '{}',
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_sandbox_events_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "sandbox_request_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "sandboxAccountId" uuid NOT NULL,
        "method" character varying(10) NOT NULL,
        "path" character varying(500) NOT NULL,
        "statusCode" integer NOT NULL,
        "durationMs" integer NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_sandbox_request_logs_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_sandbox_accounts_userId" ON "sandbox_accounts" ("userId")`);
    await queryRunner.query(`CREATE INDEX "IDX_sandbox_events_sandboxAccountId" ON "sandbox_events" ("sandboxAccountId")`);
    await queryRunner.query(`CREATE INDEX "IDX_sandbox_request_logs_sandboxAccountId" ON "sandbox_request_logs" ("sandboxAccountId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_sandbox_request_logs_sandboxAccountId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_sandbox_events_sandboxAccountId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_sandbox_accounts_userId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sandbox_request_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sandbox_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sandbox_accounts"`);
  }
}
