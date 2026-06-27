import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduledJobsService } from './scheduled-jobs.service';
import { Transaction } from '../transactions/entities/transaction.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { IdempotencyRecord } from '../common/entities/idempotency-record.entity';
import { DataRequest } from '../users/entities/data-request.entity';
import { TransactionsModule } from '../transactions/transaction.module';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { RateAlertsModule } from '../rate-alerts/rate-alerts.module';
import { CurrenciesModule } from '../currencies/currencies.module';
import { DaoModule } from '../dao/dao.module';
import { LedgerModule } from '../ledger/ledger.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { VaultsModule } from '../vaults/vaults.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Transaction,
      Notification,
      IdempotencyRecord,
      DataRequest,
    ]),
    TransactionsModule,
    BlockchainModule,
    NotificationsModule,
    UsersModule,
    RateAlertsModule,
    CurrenciesModule,
    DaoModule,
    LedgerModule,
    WebhooksModule,
    AuditLogsModule,
    VaultsModule,
  ],
  providers: [ScheduledJobsService],
  exports: [ScheduledJobsService],
})
export class ScheduledJobsModule {}
