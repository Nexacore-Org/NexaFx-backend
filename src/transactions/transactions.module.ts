import { Module } from '@nestjs/common';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { BlockchainModule } from 'src/blockchain/blockchain.module';
import { AuditModule } from 'src/audit/audit.module';

// Mock repository provider
const mockTransactionRepository = {
  provide: 'TransactionRepository',
  useValue: {
    find: async () => [{ id: 1, amount: 100, currency: 'USD' }], // example mock data
    // add other methods as needed
  },
};

const mockCurrencyRepository = {
  provide: 'CurrencyRepository',
  useValue: {
    find: async () => [{ id: 1, code: 'USD', name: 'US Dollar' }], // example mock data
    // add other methods as needed
  },
};

@Module({
  imports: [BlockchainModule, AuditModule],
  controllers: [TransactionsController],
  providers: [
    TransactionsService,
    mockTransactionRepository,
    mockCurrencyRepository,
  ],
  exports: [TransactionsService],
})
export class TransactionsModule {}