import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from './transactions/entities/transaction.entity';
import { TransactionsService } from './transactions/transactions.service';
import { TransactionsController } from './transactions/transactions.controller';
import { Currency } from './currencies/entities/currency.entity';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { KycModule } from './kyc/kyc.module';
import { KycVerification } from './kyc/entities/kyc.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    TypeOrmModule.forFeature([Transaction, Currency, KycVerification]),
    UserModule,
    AuthModule,
    KycModule,
  ],
  controllers: [TransactionsController],
  providers: [TransactionsService],
})
export class AppModule {}
