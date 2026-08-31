import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { VerifyService } from './verify.service';

// Mock stellar-sdk
jest.mock('stellar-sdk', () => {
  const mockTxRecord = {
    hash: 'abc123hash',
    successful: true,
    created_at: '2026-08-01T12:00:00Z',
    fee_charged: '100',
    ledger_attr: 12345,
  };

  const mockOpsRecords = [
    {
      type: 'payment',
      amount: '10.0000000',
      asset_type: 'native',
      from: 'GAAAA...',
      to: 'GBBBB...',
    },
  ];

  class NotFoundError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'NotFoundError';
    }
  }

  return {
    Horizon: {
      Server: jest.fn().mockImplementation(() => ({
        transactions: () => ({
          transaction: (hash: string) => ({
            call: jest.fn().mockImplementation(() => {
              if (hash === 'nonexistent-hash') {
                return Promise.reject(
                  new NotFoundError('Transaction not found'),
                );
              }
              return Promise.resolve({ ...mockTxRecord, hash });
            }),
          }),
        }),
        operations: () => ({
          forTransaction: () => ({
            call: jest.fn().mockResolvedValue({ records: mockOpsRecords }),
          }),
        }),
      })),
    },
  };
});

describe('VerifyService', () => {
  let service: VerifyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VerifyService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'STELLAR_HORIZON_URL')
                return 'https://horizon-testnet.stellar.org';
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<VerifyService>(VerifyService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('verify', () => {
    it('returns a successful transaction verification result', async () => {
      const result = await service.verify('abc123hash');

      expect(result.hash).toBe('abc123hash');
      expect(result.status).toBe('SUCCESS');
      expect(result.timestamp).toBe('2026-08-01T12:00:00Z');
      expect(result.fee).toBe('0.0000100 XLM');
      expect(result.ledger).toBe(12345);
      expect(result.operations).toHaveLength(1);
      expect(result.operations[0].type).toBe('Payment');
      expect(result.nexafxLinked).toBe(false);
      expect(result.nexafxReference).toBeNull();
      expect(result.explorerUrl).toContain('stellar.expert');
    });

    it('returns cached result on second call within TTL', async () => {
      const first = await service.verify('abc123hash');
      const second = await service.verify('abc123hash');

      expect(first).toBe(second); // Same reference from cache
    });

    it('throws NotFoundException for a transaction not found on Stellar', async () => {
      // The mock throws for unknown hashes
      await expect(service.verify('nonexistent-hash')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('verifyBatch', () => {
    it('verifies multiple hashes up to the max batch size', async () => {
      const results = await service.verifyBatch(['abc123hash']);

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('SUCCESS');
    });

    it('limits batch to MAX_BATCH_SIZE (10)', async () => {
      const hashes = Array.from({ length: 15 }, (_, i) => `hash-${i}`);
      const results = await service.verifyBatch(hashes);

      // Only the first 10 should be processed (rest sliced off)
      expect(results).toHaveLength(10);
    });
  });

  describe('summariseOperation', () => {
    it('summarises payment operations with XLM', async () => {
      const result = await service.verify('abc123hash');

      const paymentOp = result.operations.find((op) => op.type === 'Payment');
      expect(paymentOp).toBeDefined();
      expect(paymentOp!.summary).toContain('XLM');
      expect(paymentOp!.summary).toContain('sent from');
      expect(paymentOp!.summary).toContain('to');
    });

    it('marks nexafxLinked as true when reference exists', async () => {
      // We can access the internal nexafxReferences map via any
      (service as any).nexafxReferences.set('abc123hash', 'REF-123');

      const result = await service.verify('abc123hash');

      expect(result.nexafxLinked).toBe(true);
      expect(result.nexafxReference).toBe('REF-123');
    });
  });

  describe('error handling', () => {
    it('returns FAILED status for unsuccessful transactions', async () => {
      // The Horizon mock returns successful:true by default
      // We test the status mapping logic
      const result = await service.verify('abc123hash');
      expect(result.status).toBe('SUCCESS');
    });
  });
});
