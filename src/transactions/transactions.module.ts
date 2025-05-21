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

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction]),
    UserModule,
    FeeModule,
    BlockchainModule,
    AuditModule,
  ],
  controllers: [TransactionsController],
  providers: [TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
