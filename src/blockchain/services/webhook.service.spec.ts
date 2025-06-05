import { Test, TestingModule } from '@nestjs/testing';
import { WebhookService } from './webhook.service';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Transaction } from '../../transactions/entities/transaction.entity';

// Mock the stellar-sdk
jest.mock('stellar-sdk', () => {
  const originalModule = jest.requireActual('stellar-sdk');
  
  return {
    __esModule: true,
    ...originalModule,
    Horizon: {
      Server: jest.fn().mockImplementation(() => ({
        payments: jest.fn().mockReturnValue({
          forAccount: jest.fn().mockReturnThis(),
          cursor: jest.fn().mockReturnThis(),
          stream: jest.fn().mockImplementation((callbacks) => {
            // Store the callbacks for testing
            return {
              close: jest.fn()
            };
          })
        }),
        transactions: jest.fn().mockReturnValue({
          transaction: jest.fn().mockReturnThis(),
          call: jest.fn().mockResolvedValue({
            ledger: 12345,
            memo: 'test-memo'
          })
        })
      }))
    },
    Keypair: {
      fromSecret: jest.fn().mockReturnValue({
        publicKey: () => 'GBWMCCCMGBIXNKVLVLUCDX3GKRKOYCPHDVZL6PBSBGJ7NNDRJRBTDWL7'
      })
    }
  };
});

describe('WebhookService', () => {
  let service: WebhookService;
  let mockTransactionRepository;

  const mockConfigService = {
    get: jest.fn((key) => {
      if (key === 'STELLAR_SECRET_KEY') return 'test-secret-key';
      if (key === 'STELLAR_HORIZON_URL') return 'https://horizon-testnet.stellar.org';
      return null;
    }),
  };

  beforeEach(async () => {
    mockTransactionRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: getRepositoryToken(Transaction),
          useValue: mockTransactionRepository,
        },
      ],
    }).compile();

    service = module.get<WebhookService>(WebhookService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should start the payment event stream', async () => {
      const startStreamSpy = jest.spyOn(service as any, 'startPaymentEventStream');
      await service.onModuleInit();
      expect(startStreamSpy).toHaveBeenCalled();
    });
  });

  describe('onModuleDestroy', () => {
    it('should stop the payment event stream', () => {
      const stopStreamSpy = jest.spyOn(service as any, 'stopPaymentEventStream');
      service.onModuleDestroy();
      expect(stopStreamSpy).toHaveBeenCalled();
    });
  });

  describe('restartPaymentEventStream', () => {
    it('should restart the payment event stream', async () => {
      const stopStreamSpy = jest.spyOn(service as any, 'stopPaymentEventStream');
      const startStreamSpy = jest.spyOn(service as any, 'startPaymentEventStream');
      
      const result = await service.restartPaymentEventStream();
      
      expect(stopStreamSpy).toHaveBeenCalled();
      expect(startStreamSpy).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
  });
});