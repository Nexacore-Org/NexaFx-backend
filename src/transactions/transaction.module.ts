import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionsService } from './services/transaction.service';
import { TransactionVerificationService } from './services/transaction-verification.service';
import { TransactionReversalService } from './services/transaction-reversal.service';
import { TransactionReversalController } from './controllers/transaction-reversal.controller';
import { TransactionsController } from './controllers/transaction.controller';
import { Transaction } from './entities/transaction.entity';
import { TransactionReversal } from './entities/transaction-reversal.entity';
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
import { ComplianceModule } from '../modules/compliance/compliance.module';
import { KycModule } from '../kyc/kyc.module';
import { MicroSavingsModule } from '../modules/micro-savings/micro-savings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, TransactionCategory, TransactionReversal]),
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
    ComplianceModule,
    KycModule,
    MicroSavingsModule,
  ],
  controllers: [TransactionsController, TransactionReversalController],
  providers: [TransactionsService, TransactionVerificationService, TransactionReversalService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
