import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { I18nModule, AcceptLanguageResolver } from 'nestjs-i18n';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { join } from 'path';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { CurrenciesModule } from './currencies/currencies.module';
import { ExchangeRatesModule } from './exchange-rates/exchange-rates.module';
import { RateComparisonModule } from './exchange-rates/rate-comparison.module';
import { CommonModule } from './common/common.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { PlanThrottlerGuard } from './common/guards/plan-throttler.guard';
import { HealthModule } from './health/health.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { NotificationsModule } from './notifications/notifications.module';
import { GdprModule } from './modules/gdpr/gdpr.module';
import { TransactionsModule } from './transactions/transaction.module';
import { BeneficiariesModule } from './beneficiaries/beneficiaries.module';
import { KycModule } from './kyc/kyc.module';
import { ScheduledJobsModule } from './scheduled-jobs/scheduled-jobs.module';
import { ReceiptsModule } from './receipts/receipts.module';
import { FeesModule } from './fees/fees.module';
import { PushNotificationsModule } from './push-notifications/push-notifications.module';
import { QrModule } from './qr/qr.module';
import { FirebaseModule } from './firebase/firebase.module';
import { AdminModule } from './admin/admin.module';
import { ReferralsModule } from './referrals/referrals.module';
import { DaoModule } from './dao/dao.module';
import { CardsModule } from './cards/cards.module';
import { GraphQLApiModule } from './graphql/graphql.module';
import { SuperAdminModule } from './super-admin/super-admin.module';
import { MaintenanceGuard } from './super-admin/guards/maintenance.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    SuperAdminModule,
    EscrowModule,
    // DAO module provides Stellar Soroban contract interaction for reward distribution
    DaoModule,
    // Stripe Issuing virtual cards, backed by the virtual_cards table
    CardsModule,
    GraphQLApiModule,
    WebhooksModule,
    WalletsModule,
    LedgerModule,
    UsersModule,
    PortfolioModule,
    FinancialHealthModule,
    CustomReportsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: MaintenanceGuard,
    },
  ],
})
export class AppModule {}
