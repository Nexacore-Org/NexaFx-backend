import { Module } from '@nestjs/common';
import { I18nModule, AcceptLanguageResolver } from 'nestjs-i18n';
import { APP_GUARD } from '@nestjs/core';
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
import { CommonModule } from './common/common.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { PlanThrottlerGuard } from './common/guards/plan-throttler.guard';
import { ImpersonationRestrictionGuard } from './common/guards/impersonation-restriction.guard';
import { HealthModule } from './health/health.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { NotificationsModule } from './notifications/notifications.module';
import { GdprModule } from './modules/gdpr/gdpr.module';
import { TransactionsModule } from './transactions/transaction.module';
import { BeneficiariesModule } from './beneficiaries/beneficiaries.module';
import { KycModule } from './kyc/kyc.module';
import { ScheduledJobsModule } from './scheduled-jobs/scheduled-jobs.module';
import { ReceiptsModule } from './receipts/receipts.module';
import { FeesModule } from './fees/fees.module';
import { PushNotificationsModule } from './push-notifications/push-notifications.module';
import { FirebaseModule } from './firebase/firebase.module';
import { AdminModule } from './admin/admin.module';
import { ReferralsModule } from './referrals/referrals.module';
import { DaoModule } from './dao/dao.module';
import { GraphQLApiModule } from './graphql/graphql.module';
import { SuperAdminModule } from './super-admin/super-admin.module';
import { GatewaysModule } from './gateways/gateways.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { WalletsModule } from './wallets/wallets.module';
import { EscrowModule } from './escrow/escrow.module';
import { RateAlertsModule } from './rate-alerts/rate-alerts.module';
import { LedgerModule } from './ledger/ledger.module';
import { UsersModule } from './users/users.module';
import { ExperimentsModule } from './experiments/experiments.module';
import { ComplianceModule } from './modules/compliance/compliance.module';
import { SearchModule } from './search/search.module';
import { MessagingModule } from './messaging/messaging.module';
import { TransactionsV2Module } from './transactions/transaction-v2.module';
import { FiatV2Module } from './fiat/fiat-v2.module';
import { BatchesV2Module } from './batches/batches-v2.module';
import { TaxModule } from './tax/tax.module';
import { OrganisationsModule } from './organisations/organisations.module';
import { SanctionsModule } from './sanctions/sanctions.module';
import { LoansModule } from './loans/loans.module';
import { DisputesModule } from './disputes/disputes.module';
import { CardsModule } from './cards/cards.module';
import { VaultsModule } from './vaults/vaults.module';
import { ZeroDowntimeDeploymentModule } from './zero-downtime-deployment/zero-downtime-deployment.module';
import { RateAlertsEnhancementModule } from './rate-alerts-enhancement/rate-alerts-enhancement.module';
import { WebhookVerificationSdkModule } from './webhook-verification-sdk/webhook-verification-sdk.module';
import { PlatformHealthRunbookModule } from './platform-health-runbook/platform-health-runbook.module';
import { RegulatoryReportingModule } from './regulatory-reporting/regulatory-reporting.module';
import { MultiSignatureWalletsModule } from './multi-signature-wallets/multi-signature-wallets.module';
import { DashboardPreferencesModule } from './dashboard-preferences/dashboard-preferences.module';
import { FraudRiskScoringModule } from './fraud-risk-scoring/fraud-risk-scoring.module';
import { DataResidencyModule } from './data-residency/data-residency.module';
import { MerchantIntegrationModule } from './merchant-integration/merchant-integration.module';
import { ProgrammablePaymentRulesModule } from './programmable-payment-rules/programmable-payment-rules.module';
import { GraphqlSubscriptionsModule } from './graphql-subscriptions/graphql-subscriptions.module';
import { LoadTestingModule } from './load-testing/load-testing.module';
import { AiKycDocVerificationModule } from './ai-kyc-doc-verification/ai-kyc-doc-verification.module';
import { MobileSdkGuideModule } from './mobile-sdk-guide/mobile-sdk-guide.module';
import { OwaspZapDastModule } from './owasp-zap-dast/owasp-zap-dast.module';
import { StellarSep24AnchorModule } from './stellar-sep24-anchor/stellar-sep24-anchor.module';
import { FraudModule } from './modules/fraud/fraud.module';
import { FiatModule } from './modules/fiat/fiat.module';
import { DbAdvisoryModule } from './modules/db-advisory/db-advisory.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get<string>('DATABASE_URL'),
        synchronize:
          process.env.NODE_ENV !== 'production' &&
          process.env.NODE_ENV !== 'staging',
        ssl:
          process.env.NODE_ENV === 'production'
            ? { rejectUnauthorized: false }
            : false,
        autoLoadEntities: true,
      }),
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        connection: {
          url: configService.get<string>('REDIS_URL') || 'redis://localhost:6379',
        },
      }),
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ([{
        ttl: configService.get<number>('THROTTLE_TTL') ?? 60000,
        limit: configService.get<number>('THROTTLE_LIMIT') ?? 100,
      }]),
    }),
    ZeroDowntimeDeploymentModule,
    RateAlertsEnhancementModule,
    WebhookVerificationSdkModule,
    PlatformHealthRunbookModule,
    RegulatoryReportingModule,
    MultiSignatureWalletsModule,
    DashboardPreferencesModule,
    FraudRiskScoringModule,
    DataResidencyModule,
    MerchantIntegrationModule,
    ProgrammablePaymentRulesModule,
    GraphqlSubscriptionsModule,
    LoadTestingModule,
    AiKycDocVerificationModule,
    MobileSdkGuideModule,
    OwaspZapDastModule,
    I18nModule.forRootAsync({
      useFactory: () => ({
        fallbackLanguage: 'en',
        loaderOptions: {
          path: join(__dirname, '/i18n/'),
          watch: true,
        },
      }),
      resolvers: [AcceptLanguageResolver],
    }),
    CommonModule,
    AuthModule,
    CurrenciesModule,
    ExchangeRatesModule,
    GatewaysModule,
    HealthModule,
    AuditLogsModule,
    NotificationsModule,
    FirebaseModule,
    TransactionsModule,
    TransactionsV2Module,
    FiatV2Module,
    BatchesV2Module,
    ReferralsModule,
    BeneficiariesModule,
    KycModule,
    ScheduledJobsModule,
    ReceiptsModule,
    FeesModule,
    PushNotificationsModule,
    // Rate alerts: user-configured exchange rate notifications
    RateAlertsModule,
    AdminModule,
    SuperAdminModule,
    EscrowModule,
    // DAO module provides Stellar Soroban contract interaction for reward distribution
    DaoModule,
    GraphQLApiModule,
    WebhooksModule,
    WalletsModule,
    LedgerModule,
    UsersModule,
    ExperimentsModule,
    ComplianceModule,
    SearchModule,
    MessagingModule,
    TaxModule,
    OrganisationsModule,
    SanctionsModule,
    LoansModule,
    DisputesModule,
    CardsModule,
    VaultsModule,
    StellarSep24AnchorModule,
    FraudModule,
    FiatModule,
    DbAdvisoryModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PlanThrottlerGuard,
    },
  ],
})
export class AppModule {}

