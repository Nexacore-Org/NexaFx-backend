import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { HttpException } from '@nestjs/common';
import {
  RewardDistribution,
  RewardDistributionStatus,
} from './entities/reward-distribution.entity';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

// Mock stellar-sdk BEFORE importing DaoService
jest.mock('stellar-sdk', () => {
  const actual = jest.requireActual('stellar-sdk');
  return {
    ...actual,
    Operation: {
      ...actual.Operation,
      invokeContractFunction: jest.fn().mockReturnValue({
        type: 'invokeContractFunction',
        source: 'GBL3F66GFSRD3LCLZ2WMJE5IFBV42H5DMIFGB6X2I5SNTFBGVJ7RHZF4',
      }),
    },
    TransactionBuilder: jest.fn().mockImplementation(() => ({
      addOperation: jest.fn().mockReturnThis(),
      setTimeout: jest.fn().mockReturnThis(),
      build: jest.fn().mockReturnValue({
        toXDR: jest.fn().mockReturnValue('mock-xdr'),
      }),
    })),
    rpc: {
      Server: jest.fn().mockImplementation(() => ({
        getNetwork: jest.fn().mockResolvedValue({ passphrase: 'Test SDF' }),
        prepareTransaction: jest.fn().mockResolvedValue({ sign: jest.fn() }),
        sendTransaction: jest
          .fn()
          .mockResolvedValue({ hash: 'test-tx-hash', status: 'PENDING' }),
      })),
    },
    Horizon: {
      Server: jest.fn().mockImplementation(() => ({
        loadAccount: jest.fn().mockResolvedValue({
          accountId: () =>
            'GBL3F66GFSRD3LCLZ2WMJE5IFBV42H5DMIFGB6X2I5SNTFBGVJ7RHZF4',
        }),
      })),
    },
    Keypair: {
      ...actual.Keypair,
      fromSecret: jest.fn().mockReturnValue({
        publicKey: () =>
          'GBL3F66GFSRD3LCLZ2WMJE5IFBV42H5DMIFGB6X2I5SNTFBGVJ7RHZF4',
        sign: jest.fn(),
      }),
    },
  };
});

// Now import DaoService after mocking
import { DaoService } from './dao.service';

describe('DaoService', () => {
  let service: DaoService;
  let rewardDistributionRepo: any;
  let auditLogsService: AuditLogsService;

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn((key: string) => {
        const config: Record<string, any> = {
          STELLAR_SOROBAN_RPC_URL:
            'https://horizon-testnet.stellar.org/soroban/rpc',
          DAO_CONTRACT_ID:
            'CAGAKXJ4PKVDG3NB6HVMQXWZQPBQSQXZZZFVBF3RIQAFH2XPZW2JZTY',
          STELLAR_HORIZON_URL: 'https://horizon-testnet.stellar.org',
          STELLAR_NETWORK: 'TESTNET',
          STELLAR_HOT_WALLET_SECRET:
            'SBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
          STELLAR_BASE_FEE: 100,
        };
        return config[key];
      }),
    };

    const mockRewardDistributionRepo = {
      create: jest.fn(),
      save: jest.fn(),
      findAndCount: jest.fn(),
    };

    const mockAuditLogsService = {
      logSystemEvent: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DaoService,
        { provide: ConfigService, useValue: mockConfigService },
        {
          provide: getRepositoryToken(RewardDistribution),
          useValue: mockRewardDistributionRepo,
        },
        { provide: AuditLogsService, useValue: mockAuditLogsService },
      ],
    }).compile();

    service = module.get<DaoService>(DaoService);
    rewardDistributionRepo = module.get(getRepositoryToken(RewardDistribution));
    auditLogsService = module.get<AuditLogsService>(AuditLogsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('invokeContract', () => {
    it('should successfully invoke a contract', async () => {
      const result = await service.invokeContract(
        'CAGAKXJ4PKVDG3NB6HVMQXWZQPBQSQXZZZFVBF3RIQAFH2XPZW2JZTY',
        'distribute',
      );
      expect(result.txHash).toBe('test-tx-hash');
    });
  });

  describe('distributeReward', () => {
    it('should save distribution record', async () => {
      const mockDist = {
        id: 'dist-1',
        status: RewardDistributionStatus.SUCCESS,
        txHash: 'test-tx-hash',
      };
      rewardDistributionRepo.create.mockReturnValue(mockDist);
      rewardDistributionRepo.save.mockResolvedValue(mockDist);

      const result = await service.distributeReward('admin-1', {
        userId: 'user-1',
        functionName: 'distribute',
        amount: 100,
        currency: 'XLM',
      });

      expect(result.status).toBe(RewardDistributionStatus.SUCCESS);
      expect(auditLogsService.logSystemEvent).toHaveBeenCalled();
    });
  });

  describe('getDistributions', () => {
    it('should return paginated distributions', async () => {
      const mockDists = [
        { id: 'dist-1', status: RewardDistributionStatus.SUCCESS },
      ];
      rewardDistributionRepo.findAndCount.mockResolvedValue([mockDists, 1]);

      const result = await service.getDistributions(1, 20);

      expect(result.items).toEqual(mockDists);
      expect(result.pagination.total).toBe(1);
    });
  });
});
