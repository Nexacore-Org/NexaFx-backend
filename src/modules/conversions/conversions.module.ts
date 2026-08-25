import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversionQuote } from './entities/conversion-quote.entity';
import { Transaction } from '../../transactions/entities/transaction.entity';
import { User } from '../../users/user.entity';
import { Wallet } from '../../wallets/entities/wallet.entity';
import { LedgerEntry } from '../../ledger/entities/ledger-entry.entity';
import { ExchangeRatesModule } from '../../exchange-rates/exchange-rates.module';
import { LedgerModule } from '../../ledger/ledger.module';
import { ConversionsService } from './conversions.service';
import { ConversionsController } from './conversions.controller';
import { ConversionsGateway } from './conversions.gateway';
import { FeeEstimatorService } from '../../transactions/services/fee-estimator.service';
import { FeesModule } from '../../fees/fees.module';
import { BlockchainModule } from '../../blockchain/blockchain.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ConversionQuote, Transaction, User, Wallet, LedgerEntry]),
    ExchangeRatesModule,
    LedgerModule,
    FeesModule,
    BlockchainModule,
    RedisModule,
  ],
  controllers: [ConversionsController],
  providers: [ConversionsService, ConversionsGateway, FeeEstimatorService],
  exports: [ConversionsService],
})
export class ConversionsModule {}
