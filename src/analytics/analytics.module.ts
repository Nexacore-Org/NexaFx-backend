import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { TransactionCategory } from './entities/transaction-category.entity';
import { BalanceSnapshot } from './entities/balance-snapshot.entity';
import { ReportExportJob } from './entities/report-export-job.entity';
import { Transaction } from '../transactions/entities/transaction.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TransactionCategory,
      BalanceSnapshot,
      ReportExportJob,
      Transaction,
    ]),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
