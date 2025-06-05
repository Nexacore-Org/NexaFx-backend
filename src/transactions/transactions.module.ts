/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { BlockchainModule } from 'src/blockchain/blockchain.module';
import { AuditModule } from 'src/audit/audit.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from './entities/transaction.entity';
import { UserModule } from 'src/user/user.module';
import { FeeModule } from 'src/fees/fee.module';
import { Currency } from 'src/currencies/entities/currency.entity';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, Currency]),
    UserModule,
    FeeModule,
    BlockchainModule,
    AuditModule,
    EventEmitterModule.forRoot(),
  ],
  controllers: [TransactionsController],
  providers: [TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
