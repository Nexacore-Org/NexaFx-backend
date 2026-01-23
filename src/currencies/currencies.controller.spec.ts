import { Test, TestingModule } from '@nestjs/testing';
import { CurrenciesController } from './currencies.controller';
import { CurrenciesService } from './currencies.service';

describe('CurrenciesController', () => {
  let controller: CurrenciesController;
  let service: CurrenciesService;

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
  ];

  const mockCurrenciesService = {
    findAll: jest.fn(),
    getCurrency: jest.fn(),
    getBaseCurrency: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CurrenciesController],
      providers: [
        {
          provide: CurrenciesService,
          useValue: mockCurrenciesService,
        },
      ],
    }).compile();

    controller = module.get<CurrenciesController>(CurrenciesController);
    service = module.get<CurrenciesService>(CurrenciesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return an array of currencies', async () => {
      mockCurrenciesService.findAll.mockResolvedValue(mockCurrencies);

      const result = await controller.findAll();

      expect(result).toEqual(mockCurrencies);
      expect(service.findAll).toHaveBeenCalled();
    });
  });

  describe('getBaseCurrency', () => {
    it('should return the base currency', async () => {
      const baseCurrency = mockCurrencies[0];
      mockCurrenciesService.getBaseCurrency.mockResolvedValue(baseCurrency);

      const result = await controller.getBaseCurrency();

      expect(result).toEqual(baseCurrency);
      expect(service.getBaseCurrency).toHaveBeenCalled();
    });
  });

  describe('getCurrency', () => {
    it('should return a specific currency by code', async () => {
      const usdCurrency = mockCurrencies[1];
      mockCurrenciesService.getCurrency.mockResolvedValue(usdCurrency);

      const result = await controller.getCurrency('USD');

      expect(result).toEqual(usdCurrency);
      expect(service.getCurrency).toHaveBeenCalledWith('USD');
    });
  });
});
