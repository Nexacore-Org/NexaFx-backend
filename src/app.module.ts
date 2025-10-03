/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { RatesModule } from './rates/rates.module';
import { CurrenciesModule } from './currencies/currencies.module';
import { TransactionsModule } from './transactions/transactions.module';
import { AuditInterceptor } from './common/interceptors/audit/audit.interceptor';
import { BlockchainModule } from './blockchain/blockchain.module';
import { AuditModule } from './audit/audit.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { AdminModule } from './admin/admin.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { FeeModule } from './fees/fee.module';
import { NotificationsModule } from './notifications/notifications.module';
import { NotificationPreferencesModule } from './notification-preferences/notification-preferences.module';
import databaseConfig from './config/database.config';
import configuration from './config/configuration';
import { validationSchema } from './config/validation.schema';
// import { ScheduledTransferModule } from './scheduled-transfers/scheduled-transfers.module';
import { ProfilePictureModule } from './profile-picture/profile-picture.module';
import { MailModule } from './mail/mail.module';
import { CommonModule } from './common/common.module';
import { TransfersModule } from './transfers/transfers.module';
import { ConversionsModule } from './conversions/conversions.module';
import { WithdrawModule } from './withdraw/withdraw.module';
import { DepositModule } from './deposit/deposit.module';
import { ConvertModule } from './convert/convert.module';
import { ActivityLogModule } from './activity-log/activity-log.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [databaseConfig, configuration],
      validationSchema,
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
      useFactory: (configService: ConfigService) => {
        const config = {
          type: configService.get<'postgres'>('database.type'),
          url: configService.get<string>('database.url'),
          host: configService.get<string>('database.host'),
          port: configService.get<number>('database.port'),
          username: configService.get<string>('database.username'),
          password: configService.get<string>('database.password'),
          database: configService.get<string>('database.database'),
          synchronize: configService.get<boolean>('database.synchronize'),
          ssl: configService.get('database.ssl'),
          autoLoadEntities: true,
          logging: false,
        };

        // console.log('TypeORM DB Config:', config); // Add this

        return config;
      },
      inject: [ConfigService],
    }),
    UserModule,
    AuthModule,
    RatesModule,
    BlockchainModule,
    TransactionsModule,
    CurrenciesModule,
    NotificationsModule,
    AuditModule,
    AdminModule,
    FeeModule,
    AnnouncementsModule,
    NotificationPreferencesModule,
    ProfilePictureModule,
    MailModule,
    TransfersModule,
    ConversionsModule,
    WithdrawModule,
    DepositModule,
    ConvertModule,
    ActivityLogModule,
    CommonModule,
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
