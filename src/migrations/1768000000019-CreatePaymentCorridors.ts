import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePaymentCorridors1768000000019 implements MigrationInterface {
  name = 'CreatePaymentCorridors1768000000019';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "payment_corridors_requiredkycTier_enum" AS ENUM ('BASIC', 'STANDARD', 'ENHANCED')
    `);

    await queryRunner.query(`
      CREATE TABLE "payment_corridors" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "sourceCurrency" varchar(10) NOT NULL,
        "destinationCurrency" varchar(10) NOT NULL,
        "sourceCountry" varchar(2) NOT NULL,
        "destinationCountry" varchar(2) NOT NULL,
        "isActive" boolean NOT NULL DEFAULT true,
        "minAmount" numeric(20,8) NOT NULL,
        "maxAmount" numeric(20,8) NOT NULL,
        "estimatedMinutes" integer NOT NULL,
        "deliveryMethods" text,
        "complianceNotes" text,
        "feePercent" numeric(5,4) NOT NULL,
        "requiredKycTier" "payment_corridors_requiredkycTier_enum" NOT NULL DEFAULT 'BASIC',
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payment_corridors" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "payment_corridors"`);
    await queryRunner.query(`DROP TYPE "payment_corridors_requiredkycTier_enum"`);
  }
}
