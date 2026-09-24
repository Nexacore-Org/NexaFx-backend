import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { TestnetFaucetService } from './testnet-faucet.service';
import {
  FaucetRequest,
  FaucetRequestStatus,
} from './entities/faucet-request.entity';

describe('TestnetFaucetService', () => {
  let service: TestnetFaucetService;
  let faucetRequestRepo: Repository<FaucetRequest>;

  const mockFaucetRequestRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: unknown) => {
      const config: Record<string, string> = {
        STELLAR_NETWORK: 'TESTNET',
        FAUCET_COOLDOWN_MINUTES: '60',
        FAUCET_AMOUNT_XLM: '10',
      };
      return config[key] || defaultValue;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TestnetFaucetService,
        {
          provide: getRepositoryToken(FaucetRequest),
          useValue: mockFaucetRequestRepo,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<TestnetFaucetService>(TestnetFaucetService);
    faucetRequestRepo = module.get(getRepositoryToken(FaucetRequest));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('requestFaucet', () => {
    const validKey = 'GA22CWZC4VMYBDKU43PBYHGB7W3YO7WZY3GOTCM4NNJWDPZRYNKB6FSS';

    it('should throw BadRequestException on non-testnet', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'STELLAR_NETWORK') return 'PUBLIC';
        return '10';
      });

      await expect(
        service.requestFaucet(
          { stellarPublicKey: validKey },
          'user-id',
          '127.0.0.1',
        ),
      ).rejects.toThrow('Testnet faucet is only available on the TESTNET network');
    });

    it('should throw BadRequestException for invalid public key', async () => {
      await expect(
        service.requestFaucet(
          { stellarPublicKey: 'invalid' },
          'user-id',
          '127.0.0.1',
        ),
      ).rejects.toThrow('Invalid Stellar public key');
    });

    it('should throw BadRequestException for invalid amount', async () => {
      await expect(
        service.requestFaucet(
          { stellarPublicKey: validKey, amount: '200' },
          'user-id',
          '127.0.0.1',
        ),
      ).rejects.toThrow('Invalid amount');
    });

    it('should throw BadRequestException when cooldown is active', async () => {
      mockFaucetRequestRepo.findOne.mockResolvedValue({
        status: FaucetRequestStatus.COMPLETED,
        createdAt: new Date(),
      });

      await expect(
        service.requestFaucet(
          { stellarPublicKey: validKey },
          'user-id',
          '127.0.0.1',
        ),
      ).rejects.toThrow('Cooldown active');
    });

    it('should process faucet request successfully', async () => {
      mockFaucetRequestRepo.findOne.mockResolvedValue(null);
      const mockRequest = {
        id: 'test-id',
        stellarPublicKey: validKey,
        amountXlm: '10',
        status: FaucetRequestStatus.PROCESSING,
        txHash: null,
        createdAt: new Date(),
      };
      mockFaucetRequestRepo.create.mockReturnValue(mockRequest);
      mockFaucetRequestRepo.save.mockImplementation(async (entity) => {
        if (entity.status === FaucetRequestStatus.PROCESSING) {
          return { ...entity, txHash: 'abc123', status: FaucetRequestStatus.COMPLETED };
        }
        return entity;
      });

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ hash: 'abc123' }),
      });

      const result = await service.requestFaucet(
        { stellarPublicKey: validKey },
        'user-id',
        '127.0.0.1',
      );

      expect(result.stellarPublicKey).toBe(validKey);
      expect(result.status).toBe(FaucetRequestStatus.COMPLETED);
      expect(result.txHash).toBe('abc123');
    });
  });

  describe('getRequestStatus', () => {
    it('should return faucet request status', async () => {
      const mockRequest = {
        id: 'test-id',
        stellarPublicKey: 'GA22CWZC4VMYBDKU43PBYHGB7W3YO7WZY3GOTCM4NNJWDPZRYNKB6FSS',
        amountXlm: '10',
        status: FaucetRequestStatus.COMPLETED,
        txHash: 'abc123',
        createdAt: new Date(),
      };
      mockFaucetRequestRepo.findOne.mockResolvedValue(mockRequest);

      const result = await service.getRequestStatus('test-id');

      expect(result.id).toBe('test-id');
      expect(result.status).toBe(FaucetRequestStatus.COMPLETED);
    });

    it('should throw NotFoundException for non-existent request', async () => {
      mockFaucetRequestRepo.findOne.mockResolvedValue(null);

      await expect(
        service.getRequestStatus('non-existent'),
      ).rejects.toThrow('Faucet request not found');
    });
  });
});
