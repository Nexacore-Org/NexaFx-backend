import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerStorageService } from '@nestjs/throttler';
import { User } from './user.entity';
import { RateLimitConfig } from './rate-limit-config.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { UsersAdminController } from './users.admin.controller';
import { DataExportService } from './services/data-export.service';
import { AccountDeletionService } from './services/account-deletion.service';
import { DataRequest } from './entities/data-request.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { KycRecord } from '../kyc/entities/kyc.entity';
import { Beneficiary } from '../beneficiaries/entities/beneficiary.entity';
import { AuditLog } from '../audit-logs/entities/audit-log.entity';
import { Referral } from '../referrals/entities/referral.entity';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module';
import { TokensModule } from '../tokens/tokens.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TransactionLimitsModule } from '../transactions/transaction-limits.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      RateLimitConfig,
      DataRequest,
      Transaction,
      Notification,
      KycRecord,
      Beneficiary,
      AuditLog,
      Referral,
    ]),
    ThrottlerModule,
    BlockchainModule,
    ExchangeRatesModule,
    TokensModule,
    NotificationsModule,
    TransactionLimitsModule,
  ],
  controllers: [UsersController, UsersAdminController],
  providers: [
    UsersService,
    DataExportService,
    AccountDeletionService,
    ThrottlerStorageService,
  ],
  exports: [UsersService, TypeOrmModule],
})
export class UsersModule {}
