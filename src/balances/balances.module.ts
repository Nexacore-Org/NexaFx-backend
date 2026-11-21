import { Module } from '@nestjs/common';
import { BalanceService } from './balance.service';

@Module({
  providers: [BalanceService],
  exports: [BalanceService],
})
export class BalancesModule {}
