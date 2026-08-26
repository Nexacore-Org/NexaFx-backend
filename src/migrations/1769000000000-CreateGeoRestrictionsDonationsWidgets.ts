import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateGeoRestrictionsDonationsWidgets1769000000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "restriction_type_enum" AS ENUM ('BLOCK_SEND', 'BLOCK_RECEIVE', 'BLOCK_ALL', 'LIMIT');

      CREATE TABLE "geo_restrictions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar(255) NOT NULL,
        "countryCode" varchar(2) NOT NULL,
        "restrictionType" "restriction_type_enum" NOT NULL,
        "limitAmountUsd" numeric(20,8),
        "reason" varchar(500) NOT NULL,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "IDX_geo_restrictions_country_active" ON "geo_restrictions" ("countryCode", "isActive");

      CREATE TABLE "charities" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar(255) NOT NULL,
        "description" text NOT NULL,
        "logoKey" varchar(500),
        "websiteUrl" varchar(500),
        "stellarWalletAddress" varchar(56) NOT NULL,
        "isVerified" boolean NOT NULL DEFAULT false,
        "registrationNumber" varchar(100),
        "totalReceived" numeric(20,8) NOT NULL DEFAULT '0',
        "donorCount" int NOT NULL DEFAULT 0,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );

      CREATE TYPE "campaign_status_enum" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

      CREATE TABLE "donation_campaigns" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "charityId" uuid NOT NULL REFERENCES "charities"("id") ON DELETE CASCADE,
        "title" varchar(255) NOT NULL,
        "description" text NOT NULL,
        "targetAmount" numeric(20,8),
        "currency" varchar(10) NOT NULL DEFAULT 'XLM',
        "startDate" date,
        "endDate" date,
        "raisedAmount" numeric(20,8) NOT NULL DEFAULT '0',
        "donorCount" int NOT NULL DEFAULT 0,
        "status" "campaign_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "IDX_donation_campaigns_status" ON "donation_campaigns" ("status");

      CREATE TABLE "donations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "campaignId" uuid NOT NULL REFERENCES "donation_campaigns"("id") ON DELETE CASCADE,
        "userId" uuid,
        "anonymous" boolean NOT NULL DEFAULT false,
        "amount" numeric(20,8) NOT NULL,
        "referenceNumber" varchar(20) NOT NULL UNIQUE,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "IDX_donations_campaign" ON "donations" ("campaignId");
      CREATE INDEX "IDX_donations_user" ON "donations" ("userId");

      CREATE TABLE "dashboard_widgets" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "type" varchar(100) NOT NULL UNIQUE,
        "dataEndpoint" varchar(500) NOT NULL,
        "refreshIntervalSeconds" int NOT NULL DEFAULT 30,
        "isActive" boolean NOT NULL DEFAULT true,
        "requiredPermissions" text,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "dashboard_widgets";
      DROP TABLE IF EXISTS "donations";
      DROP TABLE IF EXISTS "donation_campaigns";
      DROP TABLE IF EXISTS "charities";
      DROP TABLE IF EXISTS "geo_restrictions";
      DROP TYPE IF EXISTS "campaign_status_enum";
      DROP TYPE IF EXISTS "restriction_type_enum";
    `);
  }
}
