import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { CurrenciesModule } from './currencies/currencies.module';
import { ExchangeRatesModule } from './exchange-rates/exchange-rates.module';
import { CommonModule } from './common/common.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { HealthModule } from './health/health.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { NotificationsModule } from './notifications/notifications.module';
import { TransactionsModule } from './transactions/transaction.module';
import { BeneficiariesModule } from './beneficiaries/beneficiaries.module';
import { KycModule } from './kyc/kyc.module';
import { ScheduledJobsModule } from './scheduled-jobs/scheduled-jobs.module';
import { FeesModule } from './fees/fees.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get<string>('DATABASE_URL'),
        synchronize: true,
        ssl: {
          rejectUnauthorized: false,
        },
        autoLoadEntities: true,
      }),
      inject: [ConfigService],
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => [
        {
          ttl: (configService.get<number>('THROTTLE_TTL') ?? 60) * 1000,
          limit: configService.get<number>('THROTTLE_LIMIT') ?? 100,
        },
      ],
      inject: [ConfigService],
    }),
    CommonModule,
    AuthModule,
    CurrenciesModule,
    ExchangeRatesModule,
    HealthModule,
    AuditLogsModule,
    NotificationsModule,
    TransactionsModule,
    BeneficiariesModule,
    KycModule,
    ScheduledJobsModule,
    FeesModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
