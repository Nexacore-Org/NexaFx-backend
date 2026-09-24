import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardWidget } from './entities/dashboard-widget.entity';
import { WidgetsService } from './widgets.service';
import { WidgetsController } from './widgets.controller';
import { WalletsModule } from '../wallets/wallets.module';
import { RateAlertsModule } from '../rate-alerts/rate-alerts.module';
import { VaultsModule } from '../vaults/vaults.module';
import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DashboardWidget]),
    WalletsModule,
    RateAlertsModule,
    VaultsModule,
    ExchangeRatesModule,
  ],
  controllers: [WidgetsController],
  providers: [WidgetsService],
  exports: [WidgetsService],
})
export class WidgetsModule {}
