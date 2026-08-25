import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLending1768000000014 implements MigrationInterface {
  name = 'CreateLending1768000000014';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "lending_offer_status_enum" AS ENUM ('OPEN', 'MATCHED', 'COMPLETED', 'CANCELLED')
    `);
    await queryRunner.query(`
      CREATE TYPE "agreement_status_enum" AS ENUM ('ACTIVE', 'REPAID', 'DEFAULTED')
    `);

    await queryRunner.query(`
      CREATE TABLE "lending_offers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "lenderId" uuid NOT NULL,
        "amount" numeric(20,8) NOT NULL,
        "currency" varchar(10) NOT NULL DEFAULT 'XLM',
        "annualInterestRate" numeric(5,4) NOT NULL,
        "termDays" integer NOT NULL,
        "minBorrowerScore" integer NOT NULL DEFAULT 0,
        "status" "lending_offer_status_enum" NOT NULL DEFAULT 'OPEN',
        "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_lending_offers" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "lending_agreements" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "offerId" uuid NOT NULL,
        "borrowerId" uuid NOT NULL,
        "principalAmount" numeric(20,8) NOT NULL,
        "interestAmount" numeric(20,8) NOT NULL,
        "platformFee" numeric(20,8) NOT NULL,
        "status" "agreement_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "disbursedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "dueDate" TIMESTAMP WITH TIME ZONE NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_lending_agreements" PRIMARY KEY ("id"),
        CONSTRAINT "FK_lending_agreements_offer" FOREIGN KEY ("offerId") REFERENCES "lending_offers"("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "lending_agreements"`);
    await queryRunner.query(`DROP TABLE "lending_offers"`);
    await queryRunner.query(`DROP TYPE "agreement_status_enum"`);
    await queryRunner.query(`DROP TYPE "lending_offer_status_enum"`);
  }
}
