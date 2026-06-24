import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module';
import { User } from '../users/user.entity';
import { Transaction } from './entities/transaction.entity';
import { TransactionLimit } from './entities/transaction-limit.entity';
import { TransactionLimitService } from './services/transaction-limit.service';
import { LimitsController } from './controllers/limits.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Transaction, TransactionLimit]),
    ExchangeRatesModule,
  ],
  providers: [TransactionLimitService],
  controllers: [LimitsController],
  exports: [TransactionLimitService],
})
export class TransactionLimitsModule {}
