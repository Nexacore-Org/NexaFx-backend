import { Test, TestingModule } from '@nestjs/testing';
import { CurrenciesController } from './currencies.controller';
import { CurrenciesService } from './currencies.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Currency } from './entities/currency.entity';
import { RateFetcherService } from './services/rate-fetcher.service';
import { AuditService } from '../audit/audit.service';

describe('CurrenciesController', () => {
  let controller: CurrenciesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CurrenciesController],
      providers: [
        CurrenciesService,
        {
          provide: getRepositoryToken(Currency),
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
          },
        },
        {
          provide: RateFetcherService,
          useValue: {
            getApiHealthStatus: jest.fn(),
            getCircuitBreakerStatus: jest.fn(),
            resetCircuitBreaker: jest.fn(),
            getFallbackRates: jest.fn(),
          },
        },
        {
          provide: AuditService,
          useValue: {
            logActivity: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<CurrenciesController>(CurrenciesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
