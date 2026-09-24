import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PortfolioSnapshot } from './entities/portfolio-snapshot.entity';
import { PortfolioService } from './portfolio.service';
import { PortfolioController } from './portfolio.controller';
import { PortfolioSnapshotCron } from './portfolio-snapshot.cron';
import { WalletsModule } from '../wallets/wallets.module';
import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PortfolioSnapshot]),
    WalletsModule,
    ExchangeRatesModule,
  ],
  controllers: [PortfolioController],
  providers: [PortfolioService, PortfolioSnapshotCron],
  exports: [PortfolioService],
})
export class PortfolioModule {}
