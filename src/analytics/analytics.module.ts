import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AnalyticsController,
  TransactionCategoryController,
} from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { TransactionCategory } from './entities/transaction-category.entity';
import { BalanceSnapshot } from './entities/balance-snapshot.entity';
import { ReportExportJob } from './entities/report-export-job.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { User } from '../users/user.entity';
import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TransactionCategory,
      BalanceSnapshot,
      ReportExportJob,
      Transaction,
      User,
    ]),
    ExchangeRatesModule,
    UsersModule,
  ],
  controllers: [AnalyticsController, TransactionCategoryController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
