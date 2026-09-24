import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionLimit } from './entities/transaction-limit.entity';
import { FeeConfig } from './entities/fee-config.entity';
import { LimitsService } from './limits.service';
import { LimitsController } from './limits.controller';
import { UsersModule } from '../../users/users.module';
import { User } from '../../users/user.entity';
import { Transaction } from '../../transactions/entities/transaction.entity';
import { ExchangeRatesModule } from '../../exchange-rates/exchange-rates.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TransactionLimit, FeeConfig, User, Transaction]),
    UsersModule,
    ExchangeRatesModule,
  ],
  providers: [LimitsService],
  controllers: [LimitsController],
  exports: [LimitsService],
})
export class LimitsModule {}
