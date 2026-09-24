import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFullTextSearchVectors1763000000000
  implements MigrationInterface
{
  name = 'AddFullTextSearchVectors1763000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "transactions"
      ADD COLUMN IF NOT EXISTS "counterpartyMemo" VARCHAR(255),
      ADD COLUMN IF NOT EXISTS "reference" VARCHAR(255),
      ADD COLUMN IF NOT EXISTS "searchVector" tsvector
    `);

    await queryRunner.query(`
      ALTER TABLE "notifications"
      ADD COLUMN IF NOT EXISTS "searchVector" tsvector
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "support_tickets" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "subject" VARCHAR(255) NOT NULL,
        "body" TEXT NOT NULL,
        "searchVector" tsvector,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_support_tickets_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION update_search_vector() RETURNS trigger AS $$
      BEGIN
        NEW."searchVector" := to_tsvector('english', COALESCE(NEW.subject, '') || ' ' || COALESCE(NEW.body, ''));
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION update_transaction_search_vector() RETURNS trigger AS $$
      BEGIN
        NEW."searchVector" := to_tsvector(
          'english',
          COALESCE(NEW."counterpartyMemo", '') || ' ' || COALESCE(NEW.reference, '') || ' ' || COALESCE(NEW.metadata->>'description', '')
        );
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION update_notification_search_vector() RETURNS trigger AS $$
      BEGIN
        NEW."searchVector" := to_tsvector('english', COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.message, ''));
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryRunner.query(`
      CREATE TRIGGER "trg_support_tickets_search_vector"
      BEFORE INSERT OR UPDATE ON "support_tickets"
      FOR EACH ROW EXECUTE FUNCTION update_search_vector();
    `);

    await queryRunner.query(`
      CREATE TRIGGER "trg_transactions_search_vector"
      BEFORE INSERT OR UPDATE ON "transactions"
      FOR EACH ROW EXECUTE FUNCTION update_transaction_search_vector();
    `);

    await queryRunner.query(`
      CREATE TRIGGER "trg_notifications_search_vector"
      BEFORE INSERT OR UPDATE ON "notifications"
      FOR EACH ROW EXECUTE FUNCTION update_notification_search_vector();
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "GIN_transactions_searchVector" ON "transactions" USING GIN ("searchVector")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "GIN_notifications_searchVector" ON "notifications" USING GIN ("searchVector")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "GIN_support_tickets_searchVector" ON "support_tickets" USING GIN ("searchVector")
    `);

    await queryRunner.query(`
      UPDATE "transactions"
      SET "searchVector" = to_tsvector('english', COALESCE("counterpartyMemo", '') || ' ' || COALESCE("reference", '') || ' ' || COALESCE(metadata->>'description', ''))
      WHERE "searchVector" IS NULL
    `);
    await queryRunner.query(`
      UPDATE "notifications"
      SET "searchVector" = to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(message, ''))
      WHERE "searchVector" IS NULL
    `);
    await queryRunner.query(`
      UPDATE "support_tickets"
      SET "searchVector" = to_tsvector('english', COALESCE(subject, '') || ' ' || COALESCE(body, ''))
      WHERE "searchVector" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TRIGGER IF EXISTS "trg_support_tickets_search_vector" ON "support_tickets"');
    await queryRunner.query('DROP TRIGGER IF EXISTS "trg_transactions_search_vector" ON "transactions"');
    await queryRunner.query('DROP TRIGGER IF EXISTS "trg_notifications_search_vector" ON "notifications"');
    await queryRunner.query('DROP FUNCTION IF EXISTS update_search_vector()');
    await queryRunner.query('DROP FUNCTION IF EXISTS update_transaction_search_vector()');
    await queryRunner.query('DROP FUNCTION IF EXISTS update_notification_search_vector()');
    await queryRunner.query('DROP INDEX IF EXISTS "GIN_transactions_searchVector"');
    await queryRunner.query('DROP INDEX IF EXISTS "GIN_notifications_searchVector"');
    await queryRunner.query('DROP INDEX IF EXISTS "GIN_support_tickets_searchVector"');
    await queryRunner.query('ALTER TABLE "transactions" DROP COLUMN IF EXISTS "searchVector"');
    await queryRunner.query('ALTER TABLE "transactions" DROP COLUMN IF EXISTS "counterpartyMemo"');
    await queryRunner.query('ALTER TABLE "transactions" DROP COLUMN IF EXISTS "reference"');
    await queryRunner.query('ALTER TABLE "notifications" DROP COLUMN IF EXISTS "searchVector"');
    await queryRunner.query('DROP TABLE IF EXISTS "support_tickets"');
  }
}
