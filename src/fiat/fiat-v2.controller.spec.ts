import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { FiatV2Controller } from './fiat-v2.controller';
import { TransactionsService } from '../transactions/services/transaction.service';

describe('FiatV2Controller', () => {
  let controller: FiatV2Controller;
  let mockTransactionsService: Record<string, jest.Mock>;

  const mockTransaction = {
    id: 'tx-1',
    userId: 'user-42',
    type: 'DEPOSIT',
    amount: '100.50000000',
    currency: 'USD',
    status: 'PENDING',
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
  };

  const req = {
    user: {
      userId: 'user-42',
      walletPublicKey:
        'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOUJ3UHMNGUAO7UP',
    },
  };

  beforeEach(async () => {
    mockTransactionsService = {
      createDeposit: jest.fn().mockResolvedValue(mockTransaction),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FiatV2Controller],
      providers: [
        {
          provide: TransactionsService,
          useValue: mockTransactionsService,
        },
      ],
    }).compile();

    controller = module.get<FiatV2Controller>(FiatV2Controller);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createDeposit', () => {
    it('should delegate to TransactionsService.createDeposit with correct arguments', async () => {
      const dto = {
        amount: 100.5,
        currency: 'USD',
        method: 'bank_transfer',
      };

      const result = await controller.createDeposit(req, dto);

      expect(mockTransactionsService.createDeposit).toHaveBeenCalledWith(
        'user-42',
        {
          amount: 100.5,
          currency: 'USD',
          sourceAddress:
            'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOUJ3UHMNGUAO7UP',
        },
      );
      expect(result).toEqual(mockTransaction);
    });

    it('should include the user walletPublicKey as sourceAddress', async () => {
      const dto = {
        amount: 50,
        currency: 'EUR',
        method: 'card',
      };

      await controller.createDeposit(req, dto);

      const [, createDepositArg] =
        mockTransactionsService.createDeposit.mock.calls[0];
      expect(createDepositArg.sourceAddress).toBe(
        'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOUJ3UHMNGUAO7UP',
      );
    });

    it('should pass amount as a number (not string)', async () => {
      const dto = {
        amount: 200.75,
        currency: 'GBP',
        method: 'wire',
      };

      await controller.createDeposit(req, dto);

      const [, createDepositArg] =
        mockTransactionsService.createDeposit.mock.calls[0];
      expect(typeof createDepositArg.amount).toBe('number');
      expect(createDepositArg.amount).toBe(200.75);
    });

    it('should propagate errors from TransactionsService', async () => {
      mockTransactionsService.createDeposit.mockRejectedValue(
        new BadRequestException('Currency USD is not supported'),
      );

      const dto = {
        amount: 100,
        currency: 'USD',
        method: 'card',
      };

      await expect(controller.createDeposit(req, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should return the transaction response from TransactionsService', async () => {
      const customTransaction = {
        id: 'tx-custom',
        amount: '50.00000000',
        currency: 'NGN',
        status: 'PENDING',
      };
      mockTransactionsService.createDeposit.mockResolvedValue(
        customTransaction,
      );

      const dto = {
        amount: 50,
        currency: 'NGN',
        method: 'bank_transfer',
      };

      const result = await controller.createDeposit(req, dto);

      expect(result).toEqual(customTransaction);
    });

    it('should use the userId from the authenticated request', async () => {
      const reqWithDifferentUser = {
        user: {
          userId: 'user-99',
          walletPublicKey: 'GDIFFERENTKEY',
        },
      };

      const dto = {
        amount: 10,
        currency: 'USD',
        method: 'card',
      };

      await controller.createDeposit(reqWithDifferentUser, dto);

      expect(mockTransactionsService.createDeposit).toHaveBeenCalledWith(
        'user-99',
        expect.objectContaining({
          sourceAddress: 'GDIFFERENTKEY',
        }),
      );
    });

    it('should handle the optional reference field in FiatDepositDto', async () => {
      const dto = {
        amount: 100,
        currency: 'USD',
        method: 'bank_transfer',
        reference: 'user-note-123',
      };

      // The controller does not pass reference to createDeposit,
      // but we verify it doesn't break the call
      await controller.createDeposit(req, dto);

      expect(mockTransactionsService.createDeposit).toHaveBeenCalled();
    });
  });

  describe('idempotency behavior', () => {
    // Note: The actual Idempotency-Key header validation is handled by the
    // IdempotencyInterceptor at the module/guard level, not by this controller.
    // The interceptor pattern matching is defined in:
    //   src/common/interceptors/idempotency-patterns.ts
    // which includes /^\\/v2\\/fiat\\/deposit$/ as a mandatory endpoint.
    //
    // The controller test verifies that:
    // 1. The controller correctly delegates to TransactionsService.createDeposit
    // 2. The same call arguments produce the same result (idempotency is the
    //    interceptor's responsibility, but we verify the controller is a
    //    pure pass-through)

    it('should produce the same result when called with the same arguments', async () => {
      const dto = {
        amount: 100,
        currency: 'USD',
        method: 'card',
      };

      const result1 = await controller.createDeposit(req, dto);
      const result2 = await controller.createDeposit(req, dto);

      // Both calls produce the same mocked result
      expect(result1).toEqual(result2);
      // Service was called twice (idempotency not enforced at controller level)
      expect(mockTransactionsService.createDeposit).toHaveBeenCalledTimes(2);
    });
  });
});
