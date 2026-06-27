import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from 'nestjs-throttler-storage-redis';
import * as Joi from 'joi';
import { redisStore } from 'cache-manager-ioredis-yet';
import Redis from 'ioredis';
import { TerminusModule } from '@nestjs/terminus';
import { ThrottlerModule, ThrottlerModuleOptions } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { envValidationSchema } from './config/env.validation';
import { AppController } from './app.controller';
import { HealthModule } from './health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { CurrenciesModule } from './currencies/currencies.module';
import { ExchangeRatesModule } from './exchange-rates/exchange-rates.module';
import { CommonModule } from './common/common.module';
import { PlanThrottlerGuard } from './common/guards/plan-throttler.guard';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { NotificationsModule } from './notifications/notifications.module';
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
import { ScheduleModule } from '@nestjs/schedule';
import { GraphQLApiModule } from './graphql/graphql.module';
import { SuperAdminModule } from './super-admin/super-admin.module';
import { GatewaysModule } from './gateways/gateways.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { WalletsModule } from './wallets/wallets.module';
import { RateAlertsModule } from './rate-alerts/rate-alerts.module';
import { LedgerModule } from './ledger/ledger.module';
import { UsersModule } from './users/users.module';
import { StellarModule } from './modules/stellar/stellar.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { SupportModule } from './modules/support/support.module';
import { RedisModule } from './modules/redis/redis.module';
import { REDIS_CLIENT } from './modules/redis/redis.constants';
import { QueuesModule } from './modules/queues/queues.module';
import { MailModule } from './modules/mail/mail.module';
import { IpBlocklistModule } from './modules/ip-blocklist/ip-blocklist.module';
import { IpBlocklistGuard } from './modules/ip-blocklist/ip-blocklist.guard';
import { StorageModule } from './modules/storage/storage.module';

@Module({
  imports: [
    StorageModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validationSchema: Joi.object({
        NODE_ENV: Joi.string()
          .valid('development', 'test', 'staging', 'production')
          .default('development'),
        PORT: Joi.number().default(3001),
        DATABASE_URL: Joi.string().uri().optional(),
        REDIS_URL: Joi.string().uri().default('redis://localhost:6379'),
        JWT_SECRET: Joi.string().optional(),
        JWT_REFRESH_SECRET: Joi.string().optional(),
        THROTTLE_TTL: Joi.number().default(60),
        THROTTLE_LIMIT: Joi.number().default(100),
      }).unknown(true),
    }),
    RedisModule,
    IpBlocklistModule,
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        try {
          return {
            store: await redisStore({
              url:
                configService.get<string>('REDIS_URL') ??
                'redis://localhost:6379',
            }),
            ttl: 60_000,
          };
        } catch {
          return {
            ttl: 60_000,
          };
        }
      },
      inject: [ConfigService],
    }),
    QueuesModule,
    ScheduleModule.forRoot(),
      validationSchema: envValidationSchema,
      validationOptions: {
        abortEarly: false,
        allowUnknown: true,
      },
    }),
    TerminusModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get<string>('DATABASE_URL'),
        synchronize:
          configService.get<string>('NODE_ENV') !== 'production' &&
          configService.get<string>('NODE_ENV') !== 'staging',
        ssl:
          configService.get<string>('NODE_ENV') === 'production'
            ? { rejectUnauthorized: false }
            : false,
        autoLoadEntities: true,
      }),
    }),

    ThrottlerModule.forRootAsync({
      imports: [ConfigModule, RedisModule],
      useFactory: (configService: ConfigService, redisClient: Redis) => ({
        throttlers: [
          {
            ttl: (configService.get<number>('THROTTLE_TTL') ?? 60) * 1000,
            limit: configService.get<number>('THROTTLE_LIMIT') ?? 100,
          },
        ],
        storage: new ThrottlerStorageRedisService(redisClient),
      }),
      inject: [ConfigService, REDIS_CLIENT],
    }),
    MailModule,
    CommonModule,
    StellarModule,
    AuthModule,
    CurrenciesModule,
    ExchangeRatesModule,
    GatewaysModule,
    HealthModule,
    ScheduleModule.forRoot(),
    SupportModule,
    AuditLogsModule,
    NotificationsModule,
    FirebaseModule,
    TransactionsModule,
    ReferralsModule,
    BeneficiariesModule,
    KycModule,
    ScheduledJobsModule,
    ReceiptsModule,
    FeesModule,
    PushNotificationsModule,
    RateAlertsModule,
    AdminModule,
    SuperAdminModule,
    DaoModule,
    GraphQLApiModule,
    WebhooksModule,
    WalletsModule,
    LedgerModule,
    UsersModule,
    AnalyticsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, 
      useClass: IpBlocklistGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PlanThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
})
export class AppModule { }
