import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { KycModule } from './kyc/kyc.module';
import { KycVerification } from './kyc/entities/kyc.entity';
import { CurrenciesModule } from './currencies/currencies.module';
import { AppController } from './app.controller';
import { TransactionsModule } from './transactions/transactions.module';
import { AuditInterceptor } from './common/interceptors/audit/audit.interceptor';
import { NotificationsModule } from './notifications/notifications.module';
import { BlockchainModule } from './blockchain/blockchain.module';
import { AuditModule } from './audit/audit.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { InAppNotificationModule } from './in-app-notifications/in-app-notification.module';
import { TransactionsService } from './transactions/transactions.service';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // Global throttler module configuration
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60000, // time-to-live in milliseconds (60 seconds)
          limit: 10, // the maximum number of requests within the TTL
        },
      ],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const config = {
          type: 'postgres' as const,
          host: configService.get<string>('DB_HOST', 'localhost'),
          port: parseInt(configService.get<string>('DB_PORT', '5432')),
          username: configService.get<string>('DB_USERNAME', 'postgres'),
          password: configService.get<string>('DB_PASSWORD', 'password'),
          database: configService.get<string>('DB_NAME', 'nexafx'),
          synchronize: configService.get('NODE_ENV') === 'development',
          autoLoadEntities: true,
          logging: false,
        };
        return config;
      },
      inject: [ConfigService],
    }),
    UserModule,
    AuthModule,
    KycModule,
    BlockchainModule,
    EventEmitterModule.forRoot(),
    TransactionsModule,
    CurrenciesModule,
    NotificationsModule,
    AuditModule,
    InAppNotificationModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
    {
      // Global guard application
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
  exports: [AppService]
})
export class AppModule {}
