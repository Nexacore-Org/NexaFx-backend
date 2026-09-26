import { Test, TestingModule } from '@nestjs/testing';
import { LedgerController } from './ledger.controller';
import { LedgerVerificationService } from '../services/ledger-verification.service';
import { LedgerEntriesQueryDto } from '../dto/ledger-entries-query.dto';

const mockLedgerVerificationService = () => ({
  verify: jest.fn(),
  getEntries: jest.fn(),
  getBalances: jest.fn(),
});

describe('LedgerController', () => {
  let controller: LedgerController;
  let verificationService: ReturnType<typeof mockLedgerVerificationService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LedgerController],
      providers: [
        {
          provide: LedgerVerificationService,
          useFactory: mockLedgerVerificationService,
        },
      ],
    }).compile();

    controller = module.get<LedgerController>(LedgerController);
    verificationService = module.get(LedgerVerificationService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('verifyLedger()', () => {
    it('delegates to verificationService.verify()', async () => {
      const expected = { status: 'BALANCED', discrepancies: [] };
      verificationService.verify.mockResolvedValue(expected);

      const result = await controller.verifyLedger();

      expect(verificationService.verify).toHaveBeenCalledTimes(1);
      expect(result).toEqual(expected);
    });

    it('returns DISCREPANCY result from service', async () => {
      const expected = {
        status: 'DISCREPANCY',
        discrepancies: [{ currency: 'USD', amountDelta: '-50.00' }],
      };
      verificationService.verify.mockResolvedValue(expected);

      const result = await controller.verifyLedger();
      expect(result.status).toBe('DISCREPANCY');
    });
  });

  describe('getEntries()', () => {
    it('delegates to verificationService.getEntries() with transactionId from query', async () => {
      const query: LedgerEntriesQueryDto = { transactionId: 'tx-abc-123' };
      const entries = [{ id: 'entry-1', transactionId: 'tx-abc-123' }];
      verificationService.getEntries.mockResolvedValue(entries);

      const result = await controller.getEntries(query);

      expect(verificationService.getEntries).toHaveBeenCalledWith('tx-abc-123');
      expect(result).toEqual(entries);
    });

    it('passes undefined transactionId when not provided in query', async () => {
      const query: LedgerEntriesQueryDto = {};
      verificationService.getEntries.mockRejectedValue(
        new Error('transactionId is required'),
      );

      await expect(controller.getEntries(query)).rejects.toThrow(
        'transactionId is required',
      );
      expect(verificationService.getEntries).toHaveBeenCalledWith(undefined);
    });
  });

  describe('getBalances()', () => {
    it('delegates to verificationService.getBalances()', async () => {
      const balances = [
        { currency: 'USD', accountType: 'USER', balance: '1000.00' },
      ];
      verificationService.getBalances.mockResolvedValue(balances);

      const result = await controller.getBalances();

      expect(verificationService.getBalances).toHaveBeenCalledTimes(1);
      expect(result).toEqual(balances);
    });
  });
});
