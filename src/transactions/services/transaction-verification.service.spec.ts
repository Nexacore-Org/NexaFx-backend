jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { SCHEDULE_CRON_OPTIONS } from '@nestjs/schedule';
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

  it('is not registered as a scheduled cron job', () => {
    expect(
      Reflect.getMetadata(
        SCHEDULE_CRON_OPTIONS,
        service.verifyPendingTransactions,
      ),
    ).toBeUndefined();
  });

  it('verifyPendingTransactions is directly callable without throwing', async () => {
    mockTransactionsService.getPendingTransactions.mockResolvedValue([]);

    await expect(service.verifyPendingTransactions()).resolves.toEqual({
      total: 0,
      verified: 0,
      failed: 0,
      durationMs: expect.any(Number),
    });
  });

  it('fetches only a bounded batch of pending transactions', async () => {
    mockTransactionsService.getPendingTransactions.mockResolvedValue([
      { id: 'tx-1' },
    ]);
    mockTransactionsService.verifyTransaction.mockResolvedValue({});

    await service.verifyPendingTransactions();

    expect(mockTransactionsService.getPendingTransactions).toHaveBeenCalledWith(
      100,
    );
  });

  it('logs the original transaction id for every failed verification', async () => {
    mockTransactionsService.getPendingTransactions.mockResolvedValue([
      { id: 'tx-1' },
      { id: 'tx-2' },
    ]);
    mockTransactionsService.verifyTransaction
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('horizon unavailable'));

    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    const summary = await service.verifyPendingTransactions();

    expect(summary).toMatchObject({ total: 2, verified: 1, failed: 1 });
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('tx-2'),
      expect.any(String),
    );
    expect(errorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('tx-1'),
      expect.anything(),
    );

    errorSpy.mockRestore();
  });
});
