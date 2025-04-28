import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { StellarService, StellarTransactionParams } from './stellar.service';

// Mock the stellar-sdk module
jest.mock('stellar-sdk', () => {
  const originalModule = jest.requireActual('stellar-sdk');
  
  return {
    __esModule: true,
    ...originalModule,
    Server: jest.fn().mockImplementation(() => ({
      loadAccount: jest.fn().mockImplementation((address) => {
        if (address === 'INVALID_ADDRESS') {
          throw { response: { status: 404 } };
        }
        return Promise.resolve({
          accountId: () => 'GBWMCCCMGBIXNKVLVLUCDX3GKRKOYCPHDVZL6PBSBGJ7NNDRJRBTDWL7',
          sequenceNumber: () => '123456789',
          incrementSequenceNumber: jest.fn(),
          balances: [
            { asset_type: 'native', balance: '100.5000000' },
            { 
              asset_type: 'credit_alphanum4', 
              asset_code: 'USD', 
              asset_issuer: 'GBWMCCCMGBIXNKVLVLUCDX3GKRKOYCPHDVZL6PBSBGJ7NNDRJRBTDWL7',
              balance: '50.0000000',
              limit: '1000.0000000'
            }
          ]
        });
      }),
      submitTransaction: jest.fn().mockImplementation((tx) => {
        if (tx._memo && tx._memo._value === 'fail') {
          throw {
            response: {
              data: {
                extras: {
                  result_codes: {
                    transaction: 'tx_failed',
                    operations: ['op_underfunded']
                  },
                  result_xdr: 'failed_xdr'
                }
              }
            }
          };
        }
        return Promise.resolve({
          id: 'mock-transaction-id',
          ledger: 12345,
          created_at: '2025-04-27T12:00:00Z',
          result_xdr: 'success_xdr'
        });
      })
    })),
    Networks: {
      TESTNET: 'Test SDF Network ; September 2015',
      PUBLIC: 'Public Global Stellar Network ; September 2015'
    },
    Keypair: {
      fromSecret: jest.fn().mockReturnValue({
        publicKey: () => 'GBWMCCCMGBIXNKVLVLUCDX3GKRKOYCPHDVZL6PBSBGJ7NNDRJRBTDWL7',
        secret: () => 'mock-secret-key'
      })
    },
    TransactionBuilder: {
      fromXDR: jest.fn().mockImplementation((xdr, network) => ({
        _memo: { _value: xdr.includes('fail') ? 'fail' : 'success' }
      }))
    },
    Operation: {
      payment: jest.fn()
    },
    Asset: {
      native: jest.fn()
    },
    Memo: {
      text: jest.fn()
    },
    BASE_FEE: '100',
    StrKey: {
      isValidEd25519PublicKey: jest.fn().mockImplementation(addr => addr !== 'INVALID_ADDRESS')
    }
  };
});

describe('StellarService', () => {
  let service: StellarService;
  
  // Create a proper mock of ConfigService that matches the expected type
  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config = {
        'STELLAR_HORIZON_URL': 'https://horizon-testnet.stellar.org',
        'STELLAR_NETWORK': 'testnet',
        'STELLAR_SECRET_KEY': 'mock-secret-key'
      };
      return config[key];
    }),
    // Add other required methods from ConfigService
    getOrThrow: jest.fn(),
    getOrThrowAsync: jest.fn(),
    getAsync: jest.fn(),
    set: jest.fn(),
    validate: jest.fn(),
    validationSchema: undefined,
    validationOptions: undefined,
    internalConfig: {},
    isCacheEnabled: false,
    skipProcessEnv: false,
    cache: {},
    envVariablesLoaded: true,
    loadEnvVariables: jest.fn(),
    expandVariables: jest.fn(),
    parseEnvFile: jest.fn(),
    parseEnvValue: jest.fn(),
    processEnv: process.env
  } as unknown as ConfigService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StellarService,
        {
          provide: ConfigService,
          useValue: mockConfigService
        }
      ],
    }).compile();

    service = module.get<StellarService>(StellarService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initialization', () => {
    it('should initialize with correct configuration', () => {
      expect(mockConfigService.get).toHaveBeenCalledWith('STELLAR_HORIZON_URL');
      expect(mockConfigService.get).toHaveBeenCalledWith('STELLAR_NETWORK');
      expect(mockConfigService.get).toHaveBeenCalledWith('STELLAR_SECRET_KEY');
    });

    it('should throw error if secret key is not defined', async () => {
      jest.spyOn(mockConfigService, 'get').mockImplementation((key: string) => {
        if (key === 'STELLAR_SECRET_KEY') return undefined;
        return 'test';
      });

      expect(() => {
        new StellarService(mockConfigService);
      }).toThrow('STELLAR_SECRET_KEY is not defined in environment variables');
    });
  });

  describe('sendTransaction', () => {
    const validTransactionParams: StellarTransactionParams = {
      destinationAddress: 'GBWMCCCMGBIXNKVLVLUCDX3GKRKOYCPHDVZL6PBSBGJ7NNDRJRBTDWL7',
      amount: '10.5',
      asset: 'XLM',
      memo: 'test payment'
    };

    it('should successfully send a transaction', async () => {
      const buildAndSignSpy = jest.spyOn(service, 'buildAndSignTransaction')
        .mockResolvedValue('signed_xdr_success');
      const submitSpy = jest.spyOn(service, 'submitTransaction')
        .mockResolvedValue({
          successful: true,
          transactionHash: 'mock-transaction-id',
          ledger: 12345,
          createdAt: '2025-04-27T12:00:00Z',
          resultXdr: 'success_xdr'
        });

      const result = await service.sendTransaction(validTransactionParams);

      expect(buildAndSignSpy).toHaveBeenCalledWith(validTransactionParams);
      expect(submitSpy).toHaveBeenCalledWith('signed_xdr_success');
      expect(result.successful).toBe(true);
      expect(result.transactionHash).toBe('mock-transaction-id');
    });

    it('should handle transaction build errors', async () => {
      jest.spyOn(service, 'buildAndSignTransaction')
        .mockRejectedValue(new Error('Build error'));

      const result = await service.sendTransaction(validTransactionParams);

      expect(result.successful).toBe(false);
      expect(result.errorCode).toBe('TRANSACTION_CREATION_FAILED');
      expect(result.errorMessage).toBe('Build error');
    });
  });

  describe('accountExists', () => {
    it('should return true if account exists', async () => {
      const result = await service.accountExists('GBWMCCCMGBIXNKVLVLUCDX3GKRKOYCPHDVZL6PBSBGJ7NNDRJRBTDWL7');
      expect(result).toBe(true);
    });

    it('should return false if account does not exist', async () => {
      const result = await service.accountExists('INVALID_ADDRESS');
      expect(result).toBe(false);
    });
  });

  describe('getAccountBalances', () => {
    it('should return formatted account balances', async () => {
      const balances = await service.getAccountBalances('GBWMCCCMGBIXNKVLVLUCDX3GKRKOYCPHDVZL6PBSBGJ7NNDRJRBTDWL7');
      
      expect(balances).toHaveLength(2);
      expect(balances[0]).toEqual({
        asset: 'XLM',
        balance: '100.5000000',
        limit: undefined
      });
      expect(balances[1]).toEqual({
        asset: 'USD:GBWMCCCMGBIXNKVLVLUCDX3GKRKOYCPHDVZL6PBSBGJ7NNDRJRBTDWL7',
        balance: '50.0000000',
        limit: '1000.0000000'
      });
    });
  });
});