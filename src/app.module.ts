import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { KycModule } from './kyc/kyc.module';
import { CurrenciesModule } from './currencies/currencies.module';
import { TransactionsModule } from './transactions/transactions.module';
import { AuditInterceptor } from './common/interceptors/audit/audit.interceptor';
import { BlockchainModule } from './blockchain/blockchain.module';
import { AuditModule } from './audit/audit.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { AdminModule } from './admin/admin.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CommonModule } from './common/common.module';
import { TransactionTagsModule } from './transaction-tagging/transaction-tagging.module';
// import { CurrencyAlertModule } from './currency-alert/currency-alert.module';
import { FeeModule } from './fees/fee.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SupportTicketsModule } from './support-ticket/support-ticket.module';
import { NotificationPreferencesModule } from './notification-preferences/notification-preferences.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60000,
          limit: 10,
        },
      ],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST', 'localhost'),
        port: parseInt(configService.get<string>('DB_PORT', '5432')),
        username: configService.get<string>('DB_USERNAME', 'postgres'),
        password: configService.get<string>('DB_PASSWORD', 'password'),
        database: configService.get<string>('DB_NAME', 'nexafx'),
        synchronize: configService.get('NODE_ENV') === 'development',
        autoLoadEntities: true,
        logging: false,
      }),
      inject: [ConfigService],
    }),
    UserModule,
    AuthModule,
    KycModule,
    BlockchainModule,
    TransactionsModule,
    CurrenciesModule,
    NotificationsModule,
    AuditModule,
    AdminModule,
    FeeModule,
    AnnouncementsModule,
    CommonModule,
    SupportTicketsModule,
    TransactionTagsModule,
    NotificationPreferencesModule,
    // CurrencyAlertModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
  exports: [AppService],
})
export class AppModule {}
