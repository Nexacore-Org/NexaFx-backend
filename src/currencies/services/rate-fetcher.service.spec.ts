import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { RateFetcherService } from './rate-fetcher.service';
import { Currency } from '../entities/currency.entity';
import { CurrencyType } from '../enum/currencyType.enum';

describe('RateFetcherService', () => {
  let service: RateFetcherService;
  let repository: Repository<Currency>;
  let configService: ConfigService;

  const mockRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockImplementation((key: string) => {
      const config = {
        'API_TIMEOUT': 5000,
        'API_MAX_RETRIES': 3,
        'OPENEXCHANGERATES_API_KEY': 'test-key',
        'COINGECKO_API_KEY': 'test-key',
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateFetcherService,
        {
          provide: getRepositoryToken(Currency),
          useValue: mockRepository,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<RateFetcherService>(RateFetcherService);
    repository = module.get<Repository<Currency>>(getRepositoryToken(Currency));
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getCurrentRate', () => {
    it('should return rate for existing currency', async () => {
      const mockCurrency = {
        code: 'USD',
        rate: 1.0,
        type: CurrencyType.FIAT,
      };

      mockRepository.findOne.mockResolvedValue(mockCurrency);

      const result = await service.getCurrentRate('USD');
      expect(result).toBe(1.0);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { code: 'USD' },
      });
    });

    it('should return null for non-existent currency', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.getCurrentRate('INVALID');
      expect(result).toBeNull();
    });
  });

  // Add more test cases as needed for other methods
});
