import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEmbeddedPartners1768000000016 implements MigrationInterface {
  name = 'CreateEmbeddedPartners1768000000016';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "embedded_partners" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar(200) NOT NULL,
        "webhookUrl" varchar(500) NOT NULL,
        "allowedScopes" text,
        "clientId" varchar(100) NOT NULL,
        "clientSecretHash" varchar(255) NOT NULL,
        "isActive" boolean NOT NULL DEFAULT true,
        "brandColour" varchar(7),
        "logoUrl" varchar(500),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_embedded_partners" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_embedded_partners_clientId" UNIQUE ("clientId")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "partner_users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "partnerId" uuid NOT NULL,
        "partnerUserId" varchar(255) NOT NULL,
        "nexafxUserId" uuid NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_partner_users" PRIMARY KEY ("id"),
        CONSTRAINT "FK_partner_users_partner" FOREIGN KEY ("partnerId") REFERENCES "embedded_partners"("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "partner_users"`);
    await queryRunner.query(`DROP TABLE "embedded_partners"`);
  }
}
