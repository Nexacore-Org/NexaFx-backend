import { Module } from '@nestjs/common';
import { BalanceAlertsService } from './balance-alerts.service';
import { BalanceAlertsController } from './balance-alerts.controller';

@Module({
  controllers: [BalanceAlertsController],
  providers: [BalanceAlertsService],
  exports: [BalanceAlertsService],
})
export class BalanceAlertsModule {}
