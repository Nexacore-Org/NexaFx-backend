import { Test, TestingModule } from '@nestjs/testing';
import { TransactionResolver } from './transaction.resolver';
import { TransactionsService } from '../../transactions/services/transaction.service';
import { GqlUser } from '../decorators/current-user.decorator';
import {
  TransactionStatus,
  TransactionType,
} from '../../transactions/entities/transaction.entity';

describe('TransactionResolver', () => {
  let resolver: TransactionResolver;
  let transactionsService: jest.Mocked<TransactionsService>;

  const mockUser: GqlUser = {
    userId: 'user-uuid-123',
    email: 'test@example.com',
    role: 'USER',
  };

  const mockTransaction = {
    id: 'txn-uuid-456',
    userId: 'user-uuid-123',
    type: TransactionType.DEPOSIT,
    amount: '100.00000000',
    currency: 'XLM',
    rate: '0.10000000',
    status: TransactionStatus.SUCCESS,
    txHash: 'abc123hash',
    failureReason: null,
    feeAmount: '1.00000000',
    feeCurrency: 'XLM',
    toCurrency: null,
    toAmount: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  const mockPaginatedResult = {
    transactions: [mockTransaction],
    total: 1,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionResolver,
        {
          provide: TransactionsService,
          useValue: {
            findAllByUser: jest.fn(),
          },
        },
      ],
    }).compile();

    resolver = module.get<TransactionResolver>(TransactionResolver);
    transactionsService = module.get(TransactionsService);
  });

  describe('transactions', () => {
    it('returns paginated transactions with default limit and offset', async () => {
      transactionsService.findAllByUser.mockResolvedValue(
        mockPaginatedResult as any,
      );

      const result = await resolver.transactions(mockUser);

      expect(transactionsService.findAllByUser).toHaveBeenCalledWith(
        'user-uuid-123',
        { limit: 20, page: 1, status: undefined },
      );
      expect(result).toEqual(mockPaginatedResult);
    });

    it('converts offset and limit to page correctly', async () => {
      transactionsService.findAllByUser.mockResolvedValue(
        mockPaginatedResult as any,
      );

      await resolver.transactions(mockUser, 10, 20);

      expect(transactionsService.findAllByUser).toHaveBeenCalledWith(
        'user-uuid-123',
        { limit: 10, page: 3, status: undefined },
      );
    });

    it('filters by status when provided', async () => {
      transactionsService.findAllByUser.mockResolvedValue(
        mockPaginatedResult as any,
      );

      await resolver.transactions(mockUser, 10, 0, 'SUCCESS');

      expect(transactionsService.findAllByUser).toHaveBeenCalledWith(
        'user-uuid-123',
        { limit: 10, page: 1, status: 'SUCCESS' as TransactionStatus },
      );
    });

    it('returns zero results when user has no transactions', async () => {
      transactionsService.findAllByUser.mockResolvedValue({
        transactions: [],
        total: 0,
      });

      const result = await resolver.transactions(mockUser, 10, 0);

      expect(result).toEqual({ transactions: [], total: 0 });
    });
  });
});
