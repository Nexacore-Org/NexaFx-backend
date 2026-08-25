import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePlatformConfigs1768000000020 implements MigrationInterface {
  name = 'CreatePlatformConfigs1768000000020';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "platform_configs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "key" varchar(200) NOT NULL,
        "value" jsonb NOT NULL,
        "description" text,
        "category" varchar(50) NOT NULL,
        "isEditable" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_platform_configs" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_platform_configs_key" UNIQUE ("key")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "config_versions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "configKey" varchar(200) NOT NULL,
        "oldValue" jsonb NOT NULL,
        "newValue" jsonb NOT NULL,
        "changedBy" uuid NOT NULL,
        "changeReason" text,
        "changedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_config_versions" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "config_versions"`);
    await queryRunner.query(`DROP TABLE "platform_configs"`);
  }
}
