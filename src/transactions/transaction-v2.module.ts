import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionV2Controller } from './controllers/transaction-v2.controller';
import { NetworkController } from './controllers/network.controller';
import { TransactionsModule } from '../transactions/transaction.module';
import { TransactionConfidenceService } from './services/transaction-confidence.service';
import { Transaction } from './entities/transaction.entity';
import { WalletsModule } from '../wallets/wallets.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TransactionsModule,
    TypeOrmModule.forFeature([Transaction]),
    WalletsModule,
    UsersModule,
  ],
  controllers: [TransactionV2Controller, NetworkController],
  providers: [TransactionConfidenceService],
  exports: [TransactionConfidenceService],
})
export class TransactionsV2Module {}
