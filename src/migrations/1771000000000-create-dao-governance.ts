import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDaoGovernance1771000000000 implements MigrationInterface {
  name = 'CreateDaoGovernance1771000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create ProposalStatus enum type
    await queryRunner.query(
      `CREATE TYPE "public"."proposals_status_enum" AS ENUM('ACTIVE', 'PASSED', 'FAILED', 'CANCELLED')`,
    );

    // Create proposals table
    await queryRunner.query(
      `CREATE TABLE "proposals" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "title" character varying(255) NOT NULL,
        "description" text NOT NULL,
        "proposerId" uuid NOT NULL,
        "status" "public"."proposals_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "votingStartAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "votingEndAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "quorumPercent" numeric(5,2) NOT NULL,
        "passThresholdPercent" numeric(5,2) NOT NULL,
        "finalYesWeight" numeric(20,8),
        "finalNoWeight" numeric(20,8),
        "finalAbstainWeight" numeric(20,8),
        "totalVotingWeight" numeric(20,8),
        "onChainTxHash" character varying(128),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_proposals_id" PRIMARY KEY ("id")
      )`,
    );

    // Create indexes on proposals table
    await queryRunner.query(
      `CREATE INDEX "IDX_proposals_status" ON "proposals" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_proposals_proposerId" ON "proposals" ("proposerId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_proposals_votingEndAt" ON "proposals" ("votingEndAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_proposals_onChainTxHash" ON "proposals" ("onChainTxHash")`,
    );

    // Create VoteChoice enum type
    await queryRunner.query(
      `CREATE TYPE "public"."votes_choice_enum" AS ENUM('YES', 'NO', 'ABSTAIN')`,
    );

    // Create votes table
    await queryRunner.query(
      `CREATE TABLE "votes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "proposalId" uuid NOT NULL,
        "voterId" uuid NOT NULL,
        "choice" "public"."votes_choice_enum" NOT NULL,
        "weight" numeric(20,8) NOT NULL,
        "castAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_votes_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_votes_proposalId_voterId" UNIQUE ("proposalId", "voterId"),
        CONSTRAINT "FK_votes_proposalId" FOREIGN KEY ("proposalId") REFERENCES "proposals"("id") ON DELETE CASCADE
      )`,
    );

    // Create indexes on votes table
    await queryRunner.query(
      `CREATE INDEX "IDX_votes_proposalId_voterId" ON "votes" ("proposalId", "voterId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_votes_proposalId" ON "votes" ("proposalId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_votes_voterId" ON "votes" ("voterId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes on votes table
    await queryRunner.query(`DROP INDEX "IDX_votes_voterId"`);
    await queryRunner.query(`DROP INDEX "IDX_votes_proposalId"`);
    await queryRunner.query(`DROP INDEX "IDX_votes_proposalId_voterId"`);

    // Drop votes table
    await queryRunner.query(`DROP TABLE "votes"`);

    // Drop VoteChoice enum type
    await queryRunner.query(`DROP TYPE "public"."votes_choice_enum"`);

    // Drop indexes on proposals table
    await queryRunner.query(`DROP INDEX "IDX_proposals_onChainTxHash"`);
    await queryRunner.query(`DROP INDEX "IDX_proposals_votingEndAt"`);
    await queryRunner.query(`DROP INDEX "IDX_proposals_proposerId"`);
    await queryRunner.query(`DROP INDEX "IDX_proposals_status"`);

    // Drop proposals table
    await queryRunner.query(`DROP TABLE "proposals"`);

    // Drop ProposalStatus enum type
    await queryRunner.query(`DROP TYPE "public"."proposals_status_enum"`);
  }
}
