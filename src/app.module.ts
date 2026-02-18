import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        // host: configService.get<string>('DB_HOST') || 'localhost',
        // port: configService.get<number>('DB_PORT') || 5432,
        // username: configService.get<string>('DB_USERNAME') || 'postgres',
        // password: configService.get<string>('DB_PASSWORD') || 'postgres',
        // database: configService.get<string>('DB_NAME') || 'nexafx',
        url: configService.get<string>('DATABASE_URL'),

        // synchronize: configService.get<string>('NODE_ENV') !== 'production',
        // ssl:
        //   configService.get<string>('DB_SSL') === 'true'
        //     ? { rejectUnauthorized: false }
        //     : false,
        synchronize: true,
        ssl: {
          rejectUnauthorized: false,
        },
        autoLoadEntities: true,

        // logging: configService.get<string>('NODE_ENV') === 'development',
      }),
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
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
