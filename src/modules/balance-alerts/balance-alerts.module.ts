import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BalanceAlert } from './entities/balance-alert.entity';
import { BalanceAlertsService } from './balance-alerts.service';
import { BalanceAlertsController } from './balance-alerts.controller';

@Module({
  imports: [TypeOrmModule.forFeature([BalanceAlert])],
  controllers: [BalanceAlertsController],
  providers: [BalanceAlertsService],
  exports: [BalanceAlertsService],
})
export class BalanceAlertsModule {}
