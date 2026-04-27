jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { TransactionsService } from './transaction.service';
import { TransactionVerificationService } from './transaction-verification.service';

describe('TransactionVerificationService', () => {
  let service: TransactionVerificationService;

  const mockTransactionsService = {
    getPendingTransactions: jest.fn(),
    verifyTransaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionVerificationService,
        {
          provide: TransactionsService,
          useValue: mockTransactionsService,
        },
      ],
    }).compile();

    service = moduleRef.get(TransactionVerificationService);
  });

  it('verifyPendingTransactions is directly callable without throwing', async () => {
    mockTransactionsService.getPendingTransactions.mockResolvedValue([]);

    await expect(service.verifyPendingTransactions()).resolves.toBeUndefined();
  });
});
