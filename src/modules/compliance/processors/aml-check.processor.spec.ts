import { Test, TestingModule } from '@nestjs/testing';
import { AmlCheckProcessor } from './aml-check.processor';
import { AmlService } from '../aml.service';
import { ComplianceFlagService } from '../compliance-flag.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Transaction } from '../../../transactions/entities/transaction.entity';

const mockAmlService = {
  evaluate: jest.fn(),
};

const mockFlagService = {
  createFlag: jest.fn(),
};

const mockTransactionRepo = {
  findOne: jest.fn(),
};

describe('AmlCheckProcessor', () => {
  let processor: AmlCheckProcessor;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AmlCheckProcessor,
        {
          provide: AmlService,
          useValue: mockAmlService,
        },
        {
          provide: ComplianceFlagService,
          useValue: mockFlagService,
        },
        {
          provide: getRepositoryToken(Transaction),
          useValue: mockTransactionRepo,
        },
      ],
    }).compile();

    processor = module.get<AmlCheckProcessor>(AmlCheckProcessor);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('process', () => {
    it('should create a flag when a rule is violated', async () => {
      const job = { data: { transactionId: 'tx-id' } };
      const transaction = { id: 'tx-id' };
      mockTransactionRepo.findOne.mockResolvedValue(transaction);
      mockAmlService.evaluate.mockResolvedValue('large_transaction');

      await processor.process(job as any);

      expect(mockFlagService.createFlag).toHaveBeenCalledWith(
        transaction,
        'large_transaction',
      );
    });

    it('should not create a flag when no rules are violated', async () => {
      const job = { data: { transactionId: 'tx-id' } };
      const transaction = { id: 'tx-id' };
      mockTransactionRepo.findOne.mockResolvedValue(transaction);
      mockAmlService.evaluate.mockResolvedValue(null);

      await processor.process(job as any);

      expect(mockFlagService.createFlag).not.toHaveBeenCalled();
    });
  });
});
