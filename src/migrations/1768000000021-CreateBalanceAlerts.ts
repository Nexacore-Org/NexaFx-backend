import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBalanceAlerts1768000000021 implements MigrationInterface {
  name = 'CreateBalanceAlerts1768000000021';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "balance_alerts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "walletId" varchar NOT NULL,
        "assetCode" varchar(20) NOT NULL,
        "thresholdAmount" numeric(20,8) NOT NULL,
        "triggerType" varchar(10) NOT NULL,
        "notificationMethod" varchar(10) NOT NULL,
        "lastTriggeredAt" bigint NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_balance_alerts_walletId" ON "balance_alerts" ("walletId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_balance_alerts_walletId"`);
    await queryRunner.query(`DROP TABLE "balance_alerts"`);
  }
}
