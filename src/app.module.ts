
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { KycModule } from './kyc/kyc.module';
import { CurrenciesModule } from './currencies/currencies.module';
import { AppController } from './app.controller';
import { TransactionsModule } from './transactions/transactions.module';
import { LogsModule } from './logs/logs.module';
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core/constants';
import { AuditInterceptor } from './common/interceptors/audit/audit.interceptor';
import { TransactionsService } from './transactions/transactions.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
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
    LogsModule,
    KycModule,
    TransactionsModule,
    CurrenciesModule,
  ],
  controllers: [AppController, ],
  

  providers: [
	TransactionsService,
	{
		provide: APP_INTERCEPTOR,
		useClass: AuditInterceptor,
	},

	  ],


})
export class AppModule {}