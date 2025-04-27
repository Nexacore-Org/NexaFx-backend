import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Transaction } from './transactions/entities/transaction.entity';
import { TransactionsService } from './transactions/transactions.service';
import { TransactionsController } from './transactions/transactions.controller';
import { Currency } from './currencies/entities/currency.entity';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { KycModule } from './kyc/kyc.module';
import { KycVerification } from './kyc/entities/kyc.entity';
import { CurrenciesModule } from './currencies/currencies.module';
import { User } from './user/entities/user.entity';

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
          password: configService.get<string>('DB_PASSWORD', 'Juvino@19'),
          database: configService.get<string>('DB_NAME', 'nexafx'),
          entities: [Transaction, Currency, KycVerification, User],
          synchronize: configService.get('NODE_ENV') === 'development',
          autoLoadEntities: true,
          logging: true,
        };
        console.log('Database Config:', {
          host: config.host,
          port: config.port,
          username: config.username,
          database: config.database,
        });
        return config;
      },
      inject: [ConfigService],
    }),

    TypeOrmModule.forFeature([Transaction]),
    UserModule,
    AuthModule,
    KycModule,
    CurrenciesModule,
  ],
  controllers: [TransactionsController],
  providers: [TransactionsService],
})
export class AppModule {}
