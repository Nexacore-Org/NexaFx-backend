import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { HttpException, NotFoundException } from '@nestjs/common';
import {
  RewardDistribution,
  RewardDistributionStatus,
} from './entities/reward-distribution.entity';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { User } from '../users/user.entity';
import { IdempotencyService } from '../common/services/idempotency.service';
import { Address, nativeToScVal } from 'stellar-sdk';

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
  let userRepo: any;
  let auditLogsService: AuditLogsService;
  let idempotencyService: any;

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

    const mockUserRepo = {
      findOne: jest.fn(),
    };

    const mockAuditLogsService = {
      logSystemEvent: jest.fn().mockResolvedValue(undefined),
    };

    const mockIdempotencyService = {
      beginIdempotency: jest.fn().mockResolvedValue({ state: 'proceed' }),
      storeIdempotency: jest.fn().mockResolvedValue(undefined),
      releaseIdempotency: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DaoService,
        { provide: ConfigService, useValue: mockConfigService },
        {
          provide: getRepositoryToken(RewardDistribution),
          useValue: mockRewardDistributionRepo,
        },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: AuditLogsService, useValue: mockAuditLogsService },
        { provide: IdempotencyService, useValue: mockIdempotencyService },
      ],
    }).compile();

    service = module.get<DaoService>(DaoService);
    rewardDistributionRepo = module.get(getRepositoryToken(RewardDistribution));
    userRepo = module.get(getRepositoryToken(User));
    auditLogsService = module.get<AuditLogsService>(AuditLogsService);
    idempotencyService = module.get(IdempotencyService);
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

    it('rejects any contract or function other than the configured reward target', async () => {
      await expect(
        service.invokeContract(
          'CAGAKXJ4PKVDG3NB6HVMQXWZQPBQSQXZZZFVBF3RIQAFH2XPZW2JZTY',
          'arbitrary_function',
        ),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        service.invokeContract(
          'COTHERCONTRACT',
          'distribute',
        ),
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  describe('distributeReward', () => {
    const userId = '4a9b5b21-7d6b-4e50-a3aa-a988eb5369a7';
    const requestId = '9a598677-3e44-4bc4-8dcb-dcf704c63ca8';

    it('uses the configured reward contract and server-built arguments', async () => {
      const walletPublicKey =
        'GBL3F66GFSRD3LCLZ2WMJE5IFBV42H5DMIFGB6X2I5SNTFBGVJ7RHZF4';
      const distribution = {
        id: 'dist-1',
        status: RewardDistributionStatus.PENDING,
        txHash: null,
      };
      userRepo.findOne.mockResolvedValue({
        id: userId,
        walletPublicKey,
      });
      rewardDistributionRepo.create.mockReturnValue(distribution);
      rewardDistributionRepo.save.mockImplementation(
        async (saved: typeof distribution) => saved,
      );
      const invokeContract = jest
        .spyOn(service, 'invokeContract')
        .mockResolvedValue({ txHash: 'test-tx-hash', result: {} });

      const result = await service.distributeReward('admin-1', {
        userId,
        requestId,
        amount: 100.1234567,
        currency: 'XLM',
      });

      expect(result.status).toBe(RewardDistributionStatus.SUCCESS);
      expect(rewardDistributionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          contractId: 'CAGAKXJ4PKVDG3NB6HVMQXWZQPBQSQXZZZFVBF3RIQAFH2XPZW2JZTY',
          functionName: 'distribute',
          args: [walletPublicKey, 100.1234567, 'XLM'],
        }),
      );
      expect(invokeContract).toHaveBeenCalledWith(
        'CAGAKXJ4PKVDG3NB6HVMQXWZQPBQSQXZZZFVBF3RIQAFH2XPZW2JZTY',
        'distribute',
        [
          Address.fromString(walletPublicKey),
          nativeToScVal(1001234567n, { type: 'i128' }),
          nativeToScVal('XLM', { type: 'symbol' }),
        ],
      );
      expect(auditLogsService.logSystemEvent).toHaveBeenCalled();
      expect(idempotencyService.beginIdempotency).toHaveBeenCalledWith(
        requestId,
        userId,
        { amount: 100, currency: 'XLM' },
        'POST /dao/distribute-reward',
      );
      expect(idempotencyService.storeIdempotency).toHaveBeenCalledWith(
        requestId,
        userId,
        'POST /dao/distribute-reward',
        201,
        result,
        { amount: 100, currency: 'XLM' },
      );
    });

    it('rejects unknown users without invoking the reward contract', async () => {
      userRepo.findOne.mockResolvedValue(null);

      await expect(
        service.distributeReward('admin-1', {
          userId,
          requestId,
          amount: 100,
          currency: 'XLM',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(service.invokeContract).not.toHaveBeenCalled();
      expect(idempotencyService.releaseIdempotency).toHaveBeenCalledWith(
        requestId,
        userId,
      );
    });

    it('returns a previously completed distribution for the same request ID', async () => {
      const previousDistribution = {
        id: 'dist-1',
        status: RewardDistributionStatus.SUCCESS,
      };
      idempotencyService.beginIdempotency.mockResolvedValue({
        state: 'replay',
        statusCode: 201,
        body: previousDistribution,
        replayed: true,
      });

      await expect(
        service.distributeReward('admin-1', {
          userId,
          requestId,
          amount: 100,
          currency: 'XLM',
        }),
      ).resolves.toBe(previousDistribution);

      expect(userRepo.findOne).not.toHaveBeenCalled();
      expect(rewardDistributionRepo.create).not.toHaveBeenCalled();
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
