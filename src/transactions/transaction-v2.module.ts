import { Module } from '@nestjs/common';
import { TransactionV2Controller } from './controllers/transaction-v2.controller';
import { TransactionsModule } from '../transactions/transaction.module';

@Module({
  imports: [TransactionsModule],
  controllers: [TransactionV2Controller],
})
export class TransactionsV2Module {}
