import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CurrenciesService } from './currencies.service';
import { Currency } from './currency.entity';
import { NotFoundException } from '@nestjs/common';

describe('CurrenciesService', () => {
  let service: CurrenciesService;
  let repository: Repository<Currency>;

  const mockCurrencies = [
    {
      id: '1',
      code: 'NGN',
      name: 'Nigerian Naira',
      decimals: 2,
      isBase: true,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: '2',
      code: 'USD',
      name: 'United States Dollar',
      decimals: 2,
      isBase: false,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: '3',
      code: 'EUR',
      name: 'Euro',
      decimals: 2,
      isBase: false,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  const mockRepository = {
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(mockCurrencies),
    })),
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CurrenciesService,
        {
          provide: getRepositoryToken(Currency),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<CurrenciesService>(CurrenciesService);
    repository = module.get<Repository<Currency>>(getRepositoryToken(Currency));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return all active currencies', async () => {
      const result = await service.findAll();

      expect(result).toEqual(mockCurrencies);
      expect(repository.createQueryBuilder).toHaveBeenCalledWith('currency');
    });

    it('should return all currencies when activeOnly is false', async () => {
      const result = await service.findAll(false);

      expect(result).toEqual(mockCurrencies);
      expect(repository.createQueryBuilder).toHaveBeenCalledWith('currency');
    });
  });

  describe('getCurrency', () => {
    it('should return a currency by code', async () => {
      const usdCurrency = mockCurrencies[1];
      mockRepository.findOne.mockResolvedValue(usdCurrency);

      const result = await service.getCurrency('USD');

      expect(result).toEqual(usdCurrency);
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { code: 'USD' },
      });
    });

    it('should handle lowercase currency codes', async () => {
      const usdCurrency = mockCurrencies[1];
      mockRepository.findOne.mockResolvedValue(usdCurrency);

      const result = await service.getCurrency('usd');

      expect(result).toEqual(usdCurrency);
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { code: 'USD' },
      });
    });

    it('should throw NotFoundException if currency is not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.getCurrency('XYZ')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.getCurrency('XYZ')).rejects.toThrow(
        "Currency with code 'XYZ' not found",
      );
    });
  });

  describe('getBaseCurrency', () => {
    it('should return the base currency (NGN)', async () => {
      const baseCurrency = mockCurrencies[0];
      mockRepository.findOne.mockResolvedValue(baseCurrency);

      const result = await service.getBaseCurrency();

      expect(result).toEqual(baseCurrency);
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { isBase: true },
      });
    });

    it('should throw NotFoundException if base currency is not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.getBaseCurrency()).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.getBaseCurrency()).rejects.toThrow(
        'Base currency not found',
      );
    });
  });

  describe('isSupported', () => {
    it('should return true for a supported currency', async () => {
      const usdCurrency = mockCurrencies[1];
      mockRepository.findOne.mockResolvedValue(usdCurrency);

      const result = await service.isSupported('USD');

      expect(result).toBe(true);
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { code: 'USD' },
      });
    });

    it('should return false for an unsupported currency', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.isSupported('XYZ');

      expect(result).toBe(false);
    });

    it('should return false for an inactive currency', async () => {
      const inactiveCurrency = {
        ...mockCurrencies[1],
        isActive: false,
      };
      mockRepository.findOne.mockResolvedValue(inactiveCurrency);

      const result = await service.isSupported('USD');

      expect(result).toBe(false);
    });
  });

  describe('validateCurrency', () => {
    it('should not throw for a supported currency', async () => {
      const usdCurrency = mockCurrencies[1];
      mockRepository.findOne.mockResolvedValue(usdCurrency);

      await expect(service.validateCurrency('USD')).resolves.not.toThrow();
    });

    it('should throw NotFoundException for an unsupported currency', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.validateCurrency('XYZ')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.validateCurrency('XYZ')).rejects.toThrow(
        "Currency 'XYZ' is not supported or inactive",
      );
    });
  });

  describe('findOne', () => {
    it('should return a currency by ID', async () => {
      const usdCurrency = mockCurrencies[1];
      mockRepository.findOne.mockResolvedValue(usdCurrency);

      const result = await service.findOne('2');

      expect(result).toEqual(usdCurrency);
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: '2' },
      });
    });

    it('should throw NotFoundException if currency is not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('999')).rejects.toThrow(NotFoundException);
      await expect(service.findOne('999')).rejects.toThrow(
        "Currency with ID '999' not found",
      );
    });
  });
});
