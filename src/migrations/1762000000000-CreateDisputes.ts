import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the disputes and dispute_evidence tables.
 *
 * Dispute window: 30 days from transaction creation.
 * Evidence visibility: respondent evidence starts hidden (released = false).
 */
export class CreateDisputes1762000000000 implements MigrationInterface {
  name = 'CreateDisputes1762000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Guard: skip if already applied
    if (await queryRunner.hasTable('disputes')) {
      return;
    }

    // ── Enum types ────────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TYPE "public"."disputes_reason_enum" AS ENUM(
        'UNAUTHORIZED',
        'DUPLICATE',
        'GOODS_NOT_RECEIVED',
        'INCORRECT_AMOUNT',
        'OTHER'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."disputes_status_enum" AS ENUM(
        'OPEN',
        'UNDER_REVIEW',
        'RESOLVED_VALID',
        'RESOLVED_CHARGEBACK',
        'CLOSED'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."dispute_evidence_side_enum" AS ENUM(
        'CLAIMANT',
        'RESPONDENT',
        'ADMIN'
      )
    `);

    // ── disputes table ────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE "disputes" (
        "id"                   uuid         NOT NULL DEFAULT uuid_generate_v4(),
        "transactionId"        uuid         NOT NULL,
        "raisedById"           uuid         NOT NULL,
        "reason"               "public"."disputes_reason_enum" NOT NULL,
        "description"          text         NOT NULL,
        "status"               "public"."disputes_status_enum" NOT NULL DEFAULT 'OPEN',
        "assignedAdminId"      uuid         NULL,
        "resolution"           text         NULL,
        "disputeWindowExpiry"  TIMESTAMP WITH TIME ZONE NOT NULL,
        "createdAt"            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "resolvedAt"           TIMESTAMP WITH TIME ZONE NULL,

        CONSTRAINT "PK_disputes_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_disputes_transactionId" UNIQUE ("transactionId"),
        CONSTRAINT "FK_disputes_transaction"
          FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_disputes_raisedBy"
          FOREIGN KEY ("raisedById") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_disputes_assignedAdmin"
          FOREIGN KEY ("assignedAdminId") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    // Indexes matching entity decorators
    await queryRunner.query(`
      CREATE INDEX "IDX_disputes_status" ON "disputes" ("status")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_disputes_raisedById_status" ON "disputes" ("raisedById", "status")
    `);

    // ── dispute_evidence table ────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE "dispute_evidence" (
        "id"              uuid        NOT NULL DEFAULT uuid_generate_v4(),
        "disputeId"       uuid        NOT NULL,
        "submittedById"   uuid        NOT NULL,
        "side"            "public"."dispute_evidence_side_enum" NOT NULL,
        "description"     text        NOT NULL,
        "attachmentKeys"  text[]      NOT NULL DEFAULT '{}',
        "released"        boolean     NOT NULL DEFAULT false,
        "createdAt"       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

        CONSTRAINT "PK_dispute_evidence_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_dispute_evidence_dispute"
          FOREIGN KEY ("disputeId") REFERENCES "disputes"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_dispute_evidence_submittedBy"
          FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_dispute_evidence_disputeId" ON "dispute_evidence" ("disputeId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('disputes'))) {
      return;
    }

    await queryRunner.query('DROP TABLE IF EXISTS "dispute_evidence"');
    await queryRunner.query('DROP TABLE IF EXISTS "disputes"');
    await queryRunner.query(
      'DROP TYPE IF EXISTS "public"."dispute_evidence_side_enum"',
    );
    await queryRunner.query(
      'DROP TYPE IF EXISTS "public"."disputes_status_enum"',
    );
    await queryRunner.query(
      'DROP TYPE IF EXISTS "public"."disputes_reason_enum"',
    );
  }
}
