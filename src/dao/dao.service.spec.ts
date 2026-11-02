import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Operation } from 'stellar-sdk';
import {
  RewardDistribution,
  RewardDistributionStatus,
} from './entities/reward-distribution.entity';
import { DistributeRewardDto } from './dto/distribute-reward.dto';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { User } from '../users/user.entity';

// @nestjs/typeorm, @nestjs/config, and @nestjs/swagger ship as ESM-only in v12
jest.mock('@nestjs/typeorm', () => {
  const { Inject } = require('@nestjs/common');
  const tokenFor = (entity: { name?: string } | string) =>
    `${typeof entity === 'string' ? entity : (entity?.name ?? 'Entity')}Repository`;
  return {
    InjectRepository: (entity: { name?: string } | string) =>
      Inject(tokenFor(entity)),
    getRepositoryToken: tokenFor,
  };
});
jest.mock('@nestjs/config', () => ({
  ConfigService: class ConfigService {},
}));
jest.mock('@nestjs/swagger', () => ({
  ApiProperty: () => () => undefined,
  ApiPropertyOptional: () => () => undefined,
  ApiTags: () => () => undefined,
  ApiBearerAuth: () => () => undefined,
  ApiOperation: () => () => undefined,
  ApiResponse: () => () => undefined,
}));
jest.mock('../audit-logs/audit-logs.service', () => ({
  AuditLogsService: class AuditLogsService {},
}));

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
import { DaoService, DEFAULT_DAO_REWARD_FUNCTION } from './dao.service';

describe('DistributeRewardDto (#1470)', () => {
  const validUuid = '11111111-1111-4111-8111-111111111111';

  it('validates a well-formed payload', async () => {
    const dto = plainToInstance(DistributeRewardDto, {
      userId: validUuid,
      amount: 125.1234567,
      currency: 'XLM',
    });
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects non-UUID userId, negative or >7-decimal amounts, and disallowed currencies', async () => {
    const dto = plainToInstance(DistributeRewardDto, {
      userId: 'not-a-uuid',
      amount: 10.12345678,
      currency: 'DOGE',
    });
    const errors = await validate(dto);
    const props = errors.map((e) => e.property);
    expect(props).toEqual(
      expect.arrayContaining(['userId', 'amount', 'currency']),
    );
  });

  it('rejects arbitrary functionName, contractId, or args with 400 under ValidationPipe', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });

    await expect(
      pipe.transform(
        {
          userId: validUuid,
          amount: 10,
          currency: 'XLM',
          functionName: 'drain_treasury',
        },
        { type: 'body', metatype: DistributeRewardDto },
      ),
    ).rejects.toThrow(BadRequestException);

    await expect(
      pipe.transform(
        {
          userId: validUuid,
          amount: 10,
          currency: 'USDC',
          contractId: 'CARBITRARYCONTRACT123456789012345678901234567890123456',
        },
        { type: 'body', metatype: DistributeRewardDto },
      ),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('DaoService', () => {
  let service: DaoService;
  let rewardDistributionRepo: any;
  let userRepo: any;
  let auditLogsService: AuditLogsService;

  const configuredContractId =
    'CAGAKXJ4PKVDG3NB6HVMQXWZQPBQSQXZZZFVBF3RIQAFH2XPZW2JZTY';
  const validUserId = '11111111-1111-4111-8111-111111111111';

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn((key: string) => {
        const config: Record<string, any> = {
          STELLAR_SOROBAN_RPC_URL:
            'https://horizon-testnet.stellar.org/soroban/rpc',
          DAO_CONTRACT_ID: configuredContractId,
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
      create: jest.fn((input) => ({ id: 'dist-1', ...input })),
      save: jest.fn(async (entity) => entity),
      findAndCount: jest.fn(),
    };

    const mockUserRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: validUserId,
        email: 'member@example.com',
      }),
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
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepo,
        },
        { provide: AuditLogsService, useValue: mockAuditLogsService },
      ],
    }).compile();

    service = module.get<DaoService>(DaoService);
    rewardDistributionRepo = module.get(getRepositoryToken(RewardDistribution));
    userRepo = module.get(getRepositoryToken(User));
    auditLogsService = module.get<AuditLogsService>(AuditLogsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('invokeContract', () => {
    it('should successfully invoke the configured contract and reward function', async () => {
      const result = await service.invokeContract(
        configuredContractId,
        DEFAULT_DAO_REWARD_FUNCTION,
      );
      expect(result.txHash).toBe('test-tx-hash');
    });

    it('rejects any contractId other than DAO_CONTRACT_ID with 400 (#1470)', async () => {
      await expect(
        service.invokeContract(
          'COTHERCONTRACTID000000000000000000000000000000000000000',
          DEFAULT_DAO_REWARD_FUNCTION,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects any functionName other than the configured reward function with 400 (#1470)', async () => {
      await expect(
        service.invokeContract(configuredContractId, 'arbitrary_function'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('distributeReward', () => {
    it('builds contract args on the server and invokes DAO_CONTRACT_ID (#1470)', async () => {
      const result = await service.distributeReward('admin-1', {
        userId: validUserId,
        amount: 100,
        currency: 'XLM',
      });

      expect(result.status).toBe(RewardDistributionStatus.SUCCESS);
      expect(rewardDistributionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: validUserId,
          contractId: configuredContractId,
          functionName: DEFAULT_DAO_REWARD_FUNCTION,
          args: [validUserId, 100, 'XLM'],
          amount: 100,
          currency: 'XLM',
        }),
      );
      expect(Operation.invokeContractFunction).toHaveBeenCalledWith(
        expect.objectContaining({
          contract: configuredContractId,
          function: DEFAULT_DAO_REWARD_FUNCTION,
        }),
      );
      expect(auditLogsService.logSystemEvent).toHaveBeenCalled();
    });

    it('rejects payloads containing client-supplied functionName, contractId, or args with 400 (#1470)', async () => {
      await expect(
        service.distributeReward('admin-1', {
          userId: validUserId,
          amount: 100,
          currency: 'XLM',
          functionName: 'evil_fn',
        } as any),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.distributeReward('admin-1', {
          userId: validUserId,
          amount: 100,
          currency: 'XLM',
          contractId: 'CEVILCONTRACT',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects unknown users with 404 (#1470)', async () => {
      userRepo.findOne.mockResolvedValueOnce(null);

      await expect(
        service.distributeReward('admin-1', {
          userId: validUserId,
          amount: 50,
          currency: 'USDC',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(rewardDistributionRepo.save).not.toHaveBeenCalled();
    });

    it('enforces idempotency per (userId, requestId) so duplicate requests invoke the contract once (#1470)', async () => {
      const [first, second] = await Promise.all([
        service.distributeReward(
          'admin-1',
          { userId: validUserId, amount: 25, currency: 'XLM' },
          'req-abc-1',
        ),
        service.distributeReward(
          'admin-1',
          { userId: validUserId, amount: 25, currency: 'XLM' },
          'req-abc-1',
        ),
      ]);

      expect(first).toBe(second);
      expect(rewardDistributionRepo.create).toHaveBeenCalledTimes(1);
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
