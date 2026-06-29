import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionsService } from './services/transaction.service';
import { TransactionVerificationService } from './services/transaction-verification.service';
import { TransactionsController } from './controllers/transaction.controller';
import { Transaction } from './entities/transaction.entity';
import { TransactionCategory } from '../analytics/entities/transaction-category.entity';
import { CurrenciesModule } from '../currencies/currencies.module';
import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { UsersModule } from '../users/users.module';
import { ReferralsModule } from '../referrals/referrals.module';
import { FeesModule } from '../fees/fees.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BeneficiariesModule } from '../beneficiaries/beneficiaries.module';
import { WalletsModule } from '../wallets/wallets.module';
import { LedgerModule } from '../ledger/ledger.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { FirebaseModule } from '../firebase/firebase.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { CommonModule } from '../common/common.module';
import { TransactionLimitsModule } from './transaction-limits.module';
import { KycModule } from '../kyc/kyc.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, TransactionCategory]),
    CurrenciesModule,
    ExchangeRatesModule,
    BlockchainModule,
    UsersModule,
    ReferralsModule,
    FeesModule,
    NotificationsModule,
    BeneficiariesModule,
    WalletsModule,
    LedgerModule,
    AuditLogsModule,
    FirebaseModule,
    WebhooksModule,
    CommonModule,
    TransactionLimitsModule,
    KycModule,
  ],
  controllers: [TransactionsController],
  providers: [TransactionsService, TransactionVerificationService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
