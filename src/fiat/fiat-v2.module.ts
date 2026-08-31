import { Module } from '@nestjs/common';
import { FiatV2Controller } from './fiat-v2.controller';
import { TransactionsModule } from '../transactions/transaction.module';

@Module({
  imports: [TransactionsModule],
  controllers: [FiatV2Controller],
})
export class FiatV2Module {}
