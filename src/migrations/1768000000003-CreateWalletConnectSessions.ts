import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWalletConnectSessions1768000000003
  implements MigrationInterface
{
  name = 'CreateWalletConnectSessions1768000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "walletconnect_sessions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "sessionTopic" character varying(255) NOT NULL,
        "walletPublicKey" character varying(64) NOT NULL,
        "peerMetadata" jsonb NOT NULL DEFAULT '{}',
        "expiresAt" TIMESTAMP WITH TIME ZONE,
        "nexafxUserId" uuid,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_walletconnect_sessions_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_walletconnect_sessions_sessionTopic" UNIQUE ("sessionTopic"),
        CONSTRAINT "FK_walletconnect_sessions_user"
          FOREIGN KEY ("nexafxUserId") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_walletconnect_sessions_nexafxUserId"
      ON "walletconnect_sessions" ("nexafxUserId")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_walletconnect_sessions_isActive"
      ON "walletconnect_sessions" ("isActive")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_walletconnect_sessions_isActive"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_walletconnect_sessions_nexafxUserId"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "walletconnect_sessions"`);
  }
}
