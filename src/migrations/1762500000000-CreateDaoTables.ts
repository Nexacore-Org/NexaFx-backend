import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDaoTables1762500000000 implements MigrationInterface {
  name = 'CreateDaoTables1762500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."proposals_status_enum" AS ENUM ('ACTIVE', 'PASSED', 'FAILED', 'CANCELLED');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."proposals_proposalType_enum" AS ENUM ('STANDARD', 'CONTRACT_UPGRADE');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."proposals_voteWeightSource_enum" AS ENUM ('STAKING_BALANCE', 'XLM_BALANCE');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."proposals_onChainStatus_enum" AS ENUM ('PENDING', 'SUBMITTED', 'SUCCESS', 'FAILED');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."votes_choice_enum" AS ENUM ('YES', 'NO', 'ABSTAIN');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."reward_distributions_status_enum" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "proposals" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "title" character varying(255) NOT NULL,
        "description" text NOT NULL,
        "proposerId" uuid NOT NULL,
        "status" "public"."proposals_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "votingStartAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "votingEndAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "quorumPercent" decimal(5,2) NOT NULL,
        "passThresholdPercent" decimal(5,2) NOT NULL,
        "finalYesWeight" decimal(20,8),
        "finalNoWeight" decimal(20,8),
        "finalAbstainWeight" decimal(20,8),
        "totalVotingWeight" decimal(20,8),
        "quorumReached" boolean NOT NULL DEFAULT false,
        "balanceSnapshotsCaptured" boolean NOT NULL DEFAULT false,
        "stellarContractId" character varying(128),
        "onChainTxHash" character varying(128),
        "proposalType" "public"."proposals_proposalType_enum" NOT NULL DEFAULT 'STANDARD',
        "upgradeConfig" jsonb,
        "requiredStakeTier" character varying(50),
        "voteWeightSource" "public"."proposals_voteWeightSource_enum",
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "onChainStatus" "public"."proposals_onChainStatus_enum" NOT NULL DEFAULT 'PENDING',
        CONSTRAINT "PK_proposals_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "quorumReached" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "balanceSnapshotsCaptured" boolean NOT NULL DEFAULT false`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "votes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "proposalId" uuid NOT NULL,
        "voterId" uuid NOT NULL,
        "choice" "public"."votes_choice_enum" NOT NULL,
        "weight" decimal(20,8) NOT NULL,
        "castAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_votes_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_votes_proposalId" FOREIGN KEY ("proposalId") REFERENCES "proposals"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "reward_distributions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "contractId" character varying(64) NOT NULL,
        "functionName" character varying(128) NOT NULL,
        "args" jsonb,
        "amount" decimal(30,8) NOT NULL,
        "currency" character varying(20) NOT NULL,
        "txHash" character varying(128),
        "status" "public"."reward_distributions_status_enum" NOT NULL DEFAULT 'PENDING',
        "errorMessage" text,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_reward_distributions_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "proposal_balance_snapshots" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "proposalId" uuid NOT NULL,
        "voterId" uuid NOT NULL,
        "weight" numeric(30,8) NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_proposal_balance_snapshots_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_proposal_balance_snapshots_proposalId" FOREIGN KEY ("proposalId") REFERENCES "proposals"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_proposal_balance_snapshots_proposal_voter" UNIQUE ("proposalId", "voterId")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_proposals_proposerId" ON "proposals" ("proposerId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_proposals_status" ON "proposals" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_proposals_votingEndAt" ON "proposals" ("votingEndAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_proposals_onChainTxHash" ON "proposals" ("onChainTxHash")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_votes_proposalId_voterId" ON "votes" ("proposalId", "voterId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_votes_proposalId" ON "votes" ("proposalId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_votes_voterId" ON "votes" ("voterId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_reward_distributions_userId" ON "reward_distributions" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_reward_distributions_contractId" ON "reward_distributions" ("contractId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_reward_distributions_status" ON "reward_distributions" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_reward_distributions_createdAt" ON "reward_distributions" ("createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_proposal_balance_snapshots_proposal" ON "proposal_balance_snapshots" ("proposalId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "proposal_balance_snapshots"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reward_distributions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "votes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "proposals"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."reward_distributions_status_enum"`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."votes_choice_enum"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."proposals_onChainStatus_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."proposals_voteWeightSource_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."proposals_proposalType_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."proposals_status_enum"`,
    );
  }
}
