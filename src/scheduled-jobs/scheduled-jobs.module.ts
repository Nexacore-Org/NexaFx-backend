import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduledJobsService } from './scheduled-jobs.service';
import { Transaction } from '../transactions/entities/transaction.entity';
import { TransactionsModule } from '../transactions/transaction.module';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { Notification } from '../notifications/entities/notification.entity';
import { RateAlertsModule } from '../rate-alerts/rate-alerts.module';
import { CurrenciesModule } from '../currencies/currencies.module';
import { DaoModule } from '../dao/dao.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, Notification]),
    TransactionsModule,
    BlockchainModule,
    NotificationsModule,
    UsersModule,
    RateAlertsModule,
    CurrenciesModule,
    DaoModule,
  ],
  providers: [ScheduledJobsService],
  exports: [ScheduledJobsService],
})
export class ScheduledJobsModule {}
