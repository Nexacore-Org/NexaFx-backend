import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FeesService } from './fees.service';
import {
  FeeConfig,
  FeeTransactionType,
  FeeType,
} from './entities/fee-config.entity';
import { FeeRecord } from './entities/fee-record.entity';

describe('FeesService', () => {
  let service: FeesService;

  const mockFeeConfigRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockFeeRecordRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeesService,
        {
          provide: getRepositoryToken(FeeConfig),
          useValue: mockFeeConfigRepo,
        },
        {
          provide: getRepositoryToken(FeeRecord),
          useValue: mockFeeRecordRepo,
        },
      ],
    }).compile();

    service = module.get<FeesService>(FeesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('calculateFee', () => {
    it('should return zero fee when no config exists', async () => {
      mockFeeConfigRepo.findOne.mockResolvedValue(null);

      const result = await service.calculateFee(
        FeeTransactionType.DEPOSIT,
        'XLM',
        100,
      );

      expect(result.feeAmount).toBe(0);
      expect(result.feeCurrency).toBe('XLM');
      expect(result.feeType).toBe(FeeType.FLAT);
    });

    it('should calculate a flat fee correctly', async () => {
      const config: Partial<FeeConfig> = {
        feeType: FeeType.FLAT,
        feeValue: '0.50000000',
        minFee: undefined,
        maxFee: undefined,
      };
      mockFeeConfigRepo.findOne.mockResolvedValueOnce(config);

      const result = await service.calculateFee(
        FeeTransactionType.DEPOSIT,
        'USDC',
        100,
      );

      expect(result.feeAmount).toBe(0.5);
      expect(result.feeCurrency).toBe('USDC');
      expect(result.feeType).toBe(FeeType.FLAT);
    });

    it('should calculate a percentage fee correctly', async () => {
      const config: Partial<FeeConfig> = {
        feeType: FeeType.PERCENTAGE,
        feeValue: '1.00000000',
        minFee: undefined,
        maxFee: undefined,
      };
      mockFeeConfigRepo.findOne.mockResolvedValueOnce(config);

      const result = await service.calculateFee(
        FeeTransactionType.WITHDRAW,
        'XLM',
        200,
      );

      expect(result.feeAmount).toBe(2);
      expect(result.feeType).toBe(FeeType.PERCENTAGE);
    });

    it('should clamp percentage fee to minFee', async () => {
      const config: Partial<FeeConfig> = {
        feeType: FeeType.PERCENTAGE,
        feeValue: '0.10000000',
        minFee: '1.00000000',
        maxFee: undefined,
      };
      mockFeeConfigRepo.findOne.mockResolvedValueOnce(config);

      const result = await service.calculateFee(
        FeeTransactionType.WITHDRAW,
        'XLM',
        5,
      );

      // 0.1% of 5 = 0.005, but minFee is 1
      expect(result.feeAmount).toBe(1);
    });

    it('should clamp percentage fee to maxFee', async () => {
      const config: Partial<FeeConfig> = {
        feeType: FeeType.PERCENTAGE,
        feeValue: '5.00000000',
        minFee: undefined,
        maxFee: '10.00000000',
      };
      mockFeeConfigRepo.findOne.mockResolvedValueOnce(config);

      const result = await service.calculateFee(
        FeeTransactionType.WITHDRAW,
        'XLM',
        1000,
      );

      // 5% of 1000 = 50, but maxFee is 10
      expect(result.feeAmount).toBe(10);
    });

    it('should fall back to wildcard config when exact match not found', async () => {
      const wildcardConfig: Partial<FeeConfig> = {
        feeType: FeeType.FLAT,
        feeValue: '0.25000000',
        minFee: undefined,
        maxFee: undefined,
      };
      // First call: exact match returns null
      // Second call: wildcard returns config
      mockFeeConfigRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(wildcardConfig);

      const result = await service.calculateFee(
        FeeTransactionType.CONVERT,
        'EUR',
        500,
      );

      expect(result.feeAmount).toBe(0.25);
      expect(mockFeeConfigRepo.findOne).toHaveBeenCalledTimes(2);
    });
  });

  describe('recordFee', () => {
    it('should create and save a fee record', async () => {
      const mockRecord = {
        id: 'record-1',
        transactionId: 'tx-1',
        userId: 'user-1',
        feeAmount: '2.00000000',
        feeCurrency: 'USDC',
        feeType: FeeType.PERCENTAGE,
      };
      mockFeeRecordRepo.create.mockReturnValue(mockRecord);
      mockFeeRecordRepo.save.mockResolvedValue(mockRecord);

      const result = await service.recordFee('tx-1', 'user-1', {
        feeAmount: 2,
        feeCurrency: 'USDC',
        feeType: FeeType.PERCENTAGE,
      });

      expect(result).toEqual(mockRecord);
      expect(mockFeeRecordRepo.create).toHaveBeenCalledWith({
        transactionId: 'tx-1',
        userId: 'user-1',
        feeAmount: '2.00000000',
        feeCurrency: 'USDC',
        feeType: FeeType.PERCENTAGE,
      });
    });
  });

  describe('getFeeConfigs', () => {
    it('should return all fee configs ordered', async () => {
      const configs = [
        { id: '1', transactionType: FeeTransactionType.DEPOSIT },
        { id: '2', transactionType: FeeTransactionType.WITHDRAW },
      ];
      mockFeeConfigRepo.find.mockResolvedValue(configs);

      const result = await service.getFeeConfigs();

      expect(result).toEqual(configs);
      expect(mockFeeConfigRepo.find).toHaveBeenCalledWith({
        order: { transactionType: 'ASC', currency: 'ASC' },
      });
    });
  });

  describe('createFeeConfig', () => {
    it('should create a new fee config', async () => {
      mockFeeConfigRepo.findOne.mockResolvedValue(null);
      const created = {
        id: 'new-1',
        transactionType: FeeTransactionType.DEPOSIT,
        currency: 'USDC',
        feeType: FeeType.FLAT,
        feeValue: '1.00000000',
      };
      mockFeeConfigRepo.create.mockReturnValue(created);
      mockFeeConfigRepo.save.mockResolvedValue(created);

      const result = await service.createFeeConfig({
        transactionType: FeeTransactionType.DEPOSIT,
        currency: 'USDC',
        feeType: FeeType.FLAT,
        feeValue: 1,
      });

      expect(result.id).toBe('new-1');
    });

    it('should reject flat fee with minFee set', async () => {
      await expect(
        service.createFeeConfig({
          transactionType: FeeTransactionType.DEPOSIT,
          currency: 'USDC',
          feeType: FeeType.FLAT,
          feeValue: 1,
          minFee: 0.5,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject when minFee > maxFee', async () => {
      await expect(
        service.createFeeConfig({
          transactionType: FeeTransactionType.WITHDRAW,
          currency: 'USDC',
          feeType: FeeType.PERCENTAGE,
          feeValue: 1,
          minFee: 10,
          maxFee: 5,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject duplicate active config', async () => {
      mockFeeConfigRepo.findOne.mockResolvedValue({ id: 'existing' });

      await expect(
        service.createFeeConfig({
          transactionType: FeeTransactionType.DEPOSIT,
          currency: 'USDC',
          feeType: FeeType.FLAT,
          feeValue: 1,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateFeeConfig', () => {
    it('should update an existing fee config', async () => {
      const existing = {
        id: 'cfg-1',
        transactionType: FeeTransactionType.WITHDRAW,
        currency: 'USDC',
        feeType: FeeType.PERCENTAGE,
        feeValue: '0.50000000',
        minFee: null,
        maxFee: null,
        isActive: true,
      };
      mockFeeConfigRepo.findOne.mockResolvedValue({ ...existing });
      mockFeeConfigRepo.save.mockImplementation((entity) =>
        Promise.resolve(entity),
      );

      const result = await service.updateFeeConfig('cfg-1', {
        feeValue: 1.5,
      });

      expect(result.feeValue).toBe('1.5');
    });

    it('should throw NotFoundException for non-existent config', async () => {
      mockFeeConfigRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updateFeeConfig('non-existent', { feeValue: 1 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject setting minFee on a flat fee config', async () => {
      const existing = {
        id: 'cfg-1',
        transactionType: FeeTransactionType.DEPOSIT,
        currency: 'USDC',
        feeType: FeeType.FLAT,
        feeValue: '1.00000000',
        minFee: null,
        maxFee: null,
        isActive: true,
      };
      mockFeeConfigRepo.findOne.mockResolvedValue({ ...existing });

      await expect(
        service.updateFeeConfig('cfg-1', { minFee: 0.5 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getFeeRecordByTransactionId', () => {
    it('should return a fee record for a transaction', async () => {
      const record = {
        id: 'rec-1',
        transactionId: 'tx-1',
        feeAmount: '1.00000000',
      };
      mockFeeRecordRepo.findOne.mockResolvedValue(record);

      const result = await service.getFeeRecordByTransactionId('tx-1');

      expect(result).toEqual(record);
      expect(mockFeeRecordRepo.findOne).toHaveBeenCalledWith({
        where: { transactionId: 'tx-1' },
      });
    });

    it('should return null when no fee record exists', async () => {
      mockFeeRecordRepo.findOne.mockResolvedValue(null);

      const result = await service.getFeeRecordByTransactionId('tx-999');

      expect(result).toBeNull();
    });
  });
});
