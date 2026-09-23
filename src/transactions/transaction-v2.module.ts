import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionV2Controller } from './controllers/transaction-v2.controller';
import { NetworkController } from './controllers/network.controller';
import { TransactionsModule } from '../transactions/transaction.module';
import { FeeEstimatorService } from './services/fee-estimator.service';
import { Transaction } from './entities/transaction.entity';
import { FeesModule } from '../fees/fees.module';
import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { RedisModule } from '../modules/redis/redis.module';
import { TransactionConfidenceService } from './services/transaction-confidence.service';
import { WalletsModule } from '../wallets/wallets.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TransactionsModule,
    TypeOrmModule.forFeature([Transaction]),
    FeesModule,
    ExchangeRatesModule,
    BlockchainModule,
    RedisModule,
    WalletsModule,
    UsersModule,
  ],
  controllers: [TransactionV2Controller, NetworkController],
  providers: [FeeEstimatorService, TransactionConfidenceService],
  exports: [FeeEstimatorService, TransactionConfidenceService],
})
export class TransactionsV2Module {}
