jest.mock('@nestjs/typeorm', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
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

jest.mock('@stellar/stellar-sdk', () => ({
  StrKey: {
    isValidEd25519PublicKey: () => true,
    isValidEd25519SecretSeed: () => true,
  },
  Keypair: {
    random: () => ({
      publicKey: () => 'GPUBLICKEY',
      secret: () => 'SSECRETKEY',
    }),
  },
}));

jest.mock('@nestjs/bullmq', () => ({
  InjectQueue: () => () => undefined,
  Processor: () => () => undefined,
}));

import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { Currency } from '../currencies/currency.entity';
import {
  FeeConfig,
  FeeType,
  FeeTransactionType,
} from '../fees/entities/fee-config.entity';
import { StellarService } from '../blockchain/stellar/stellar.service';
import { UsersService } from '../users/users.service';
import { User, UserRole } from '../users/user.entity';
import { EncryptionService } from '../common/services/encryption.service';
import { WalletsService } from '../wallets/wallets.service';
import { PlatformConfig } from './entities/platform-config.entity';
import { SuperAdminService } from './super-admin.service';

describe('SuperAdminService', () => {
  let service: SuperAdminService;
  let userRepository: Repository<User>;
  let feeConfigRepository: Repository<FeeConfig>;
  let currencyRepository: Repository<Currency>;
  let platformConfigRepository: Repository<PlatformConfig>;
  let usersService: UsersService;
  let auditLogsService: AuditLogsService;
  let dataSource: { transaction: jest.Mock };

  const superAdminUser = {
    id: 'super-admin-id',
    email: 'super-admin@nexafx.test',
    role: UserRole.SUPER_ADMIN,
    referralCode: 'SUPER001',
    isVerified: true,
    isSuspended: false,
    isDeleted: false,
  } as User;

  const adminUser = {
    id: 'admin-user-id',
    email: 'admin@nexafx.test',
    role: UserRole.ADMIN,
    referralCode: 'ADMIN001',
    isVerified: true,
    isSuspended: false,
    isDeleted: false,
  } as User;

  const maintenanceConfig = {
    id: 'platform-config-id',
    maintenanceMode: false,
  } as PlatformConfig;

  beforeEach(async () => {
    const userRepoMock = {
      findOne: jest.fn(),
      find: jest.fn(),
      count: jest.fn(),
      save: jest.fn((u) => Promise.resolve(u)),
      createQueryBuilder: jest.fn(),
    };
    const currencyRepoMock = {
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn((c) => Promise.resolve(c)),
    };
    const feeConfigRepoMock = {
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn((f) => Promise.resolve(f)),
    };
    const platformConfigRepoMock = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((value) => value),
      save: jest.fn((p) => Promise.resolve(p)),
    };

    dataSource = {
      transaction: jest.fn(async (cb) => {
        const manager = {
          getRepository: (entity: unknown) => {
            if (entity === User) return userRepoMock;
            if (entity === Currency) return currencyRepoMock;
            if (entity === FeeConfig) return feeConfigRepoMock;
            if (entity === PlatformConfig) return platformConfigRepoMock;
            return null;
          },
        };
        return cb(manager);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SuperAdminService,
        {
          provide: getRepositoryToken(User),
          useValue: userRepoMock,
        },
        {
          provide: getRepositoryToken(Currency),
          useValue: currencyRepoMock,
        },
        {
          provide: getRepositoryToken(FeeConfig),
          useValue: feeConfigRepoMock,
        },
        {
          provide: getRepositoryToken(PlatformConfig),
          useValue: platformConfigRepoMock,
        },
        {
          provide: DataSource,
          useValue: dataSource,
        },
        {
          provide: UsersService,
          useValue: {
            findById: jest.fn(),
            createUser: jest.fn(),
            verifyUser: jest.fn(),
          },
        },
        {
          provide: StellarService,
          useValue: {
            generateWallet: jest.fn().mockResolvedValue({
              publicKey: 'wallet-public-key',
              secretKey: 'wallet-secret-key',
            }),
          },
        },
        {
          provide: EncryptionService,
          useValue: {
            encrypt: jest.fn().mockReturnValue('encrypted-secret'),
          },
        },
        {
          provide: AuditLogsService,
          useValue: {
            createLog: jest.fn(),
            getPrivilegedLogs: jest.fn().mockResolvedValue({
              logs: [],
              pagination: { total: 0, page: 1, limit: 20, totalPages: 0 },
            }),
          },
        },
        {
          provide: WalletsService,
          useValue: {
            createWallet: jest.fn(),
            getWalletsByUserId: jest.fn(),
            seedPrimaryWalletFromUserCredentials: jest
              .fn()
              .mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<SuperAdminService>(SuperAdminService);
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
    currencyRepository = module.get<Repository<Currency>>(
      getRepositoryToken(Currency),
    );
    feeConfigRepository = module.get<Repository<FeeConfig>>(
      getRepositoryToken(FeeConfig),
    );
    platformConfigRepository = module.get<Repository<PlatformConfig>>(
      getRepositoryToken(PlatformConfig),
    );
    usersService = module.get<UsersService>(UsersService);
    auditLogsService = module.get<AuditLogsService>(AuditLogsService);
  });

  it('creates an ADMIN user, strips @Exclude secrets including pendingTwoFactorSecret, and records a privileged audit log', async () => {
    jest.spyOn(usersService, 'findById').mockImplementation(async (userId) => {
      if (userId === superAdminUser.id) return superAdminUser;
      if (userId === adminUser.id) {
        return {
          ...adminUser,
          isVerified: true,
          password: 'hashed-password',
          walletSecretKeyEncrypted: 'encrypted-wallet-secret',
          twoFactorSecret: 'totp-active-secret',
          pendingTwoFactorSecret: 'totp-pending-secret',
        } as User;
      }
      return null;
    });
    jest.spyOn(userRepository, 'findOne').mockResolvedValueOnce(null);
    jest.spyOn(usersService, 'createUser').mockResolvedValue({
      ...adminUser,
      role: UserRole.ADMIN,
    });

    const result = await service.createAdmin(superAdminUser.id, {
      email: adminUser.email,
      password: process.env.TEST_ADMIN_PASSWORD ?? 'P@ssword123',
      firstName: 'Admin',
      lastName: 'User',
    });

    expect(result.role).toBe(UserRole.ADMIN);
    expect(result).not.toHaveProperty('password');
    expect(result).not.toHaveProperty('walletSecretKeyEncrypted');
    expect(result).not.toHaveProperty('twoFactorSecret');
    expect(result).not.toHaveProperty('pendingTwoFactorSecret');
    expect(usersService.verifyUser).toHaveBeenCalledWith(adminUser.id);
    expect(auditLogsService.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: superAdminUser.id,
        metadata: expect.objectContaining({
          actorRole: UserRole.SUPER_ADMIN,
          assignedRole: UserRole.ADMIN,
        }),
      }),
    );
  });

  it('forbids self-service SUPER_ADMIN role changes', async () => {
    jest.spyOn(usersService, 'findById').mockResolvedValue(superAdminUser);

    await expect(
      service.updateManagedAdminRole(superAdminUser.id, superAdminUser.id, {
        role: UserRole.ADMIN,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('prevents demoting the last active SUPER_ADMIN even when suspended SUPER_ADMINs exist', async () => {
    const secondSuperAdminTarget = {
      ...adminUser,
      id: 'target-super-admin-id',
      role: UserRole.SUPER_ADMIN,
      isSuspended: false,
      isDeleted: false,
    } as User;
    const suspendedSuperAdmin = {
      ...adminUser,
      id: 'suspended-super-admin-id',
      role: UserRole.SUPER_ADMIN,
      isSuspended: true,
      isDeleted: false,
    } as User;

    jest.spyOn(usersService, 'findById').mockImplementation(async (userId) => {
      if (userId === superAdminUser.id) return superAdminUser;
      if (userId === secondSuperAdminTarget.id) return secondSuperAdminTarget;
      return null;
    });

    const qbMock = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getMany: jest
        .fn()
        .mockResolvedValue([secondSuperAdminTarget, suspendedSuperAdmin]),
    };
    (userRepository.createQueryBuilder as jest.Mock).mockReturnValue(qbMock);

    await expect(
      service.updateManagedAdminRole(
        superAdminUser.id,
        secondSuperAdminTarget.id,
        {
          role: UserRole.ADMIN,
        },
      ),
    ).rejects.toThrow(BadRequestException);

    expect(qbMock.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(userRepository.save).not.toHaveBeenCalled();
  });

  it('updates platform config inside a transaction and records previous and new values in audit metadata', async () => {
    const configEntity = {
      ...maintenanceConfig,
      maintenanceMode: false,
    } as PlatformConfig;
    const usdCurrency = {
      id: 'currency-usd',
      code: 'USD',
      isActive: true,
      isBase: false,
    } as Currency;
    const feeConfig = {
      id: 'fee-config-id',
      transactionType: FeeTransactionType.DEPOSIT,
      currency: 'USD',
      feeType: FeeType.FLAT,
      feeValue: '1.5',
      minFee: null,
      maxFee: null,
      isActive: true,
    } as FeeConfig;

    jest.spyOn(usersService, 'findById').mockResolvedValue(superAdminUser);
    jest
      .spyOn(platformConfigRepository, 'findOne')
      .mockResolvedValue(configEntity);
    jest.spyOn(platformConfigRepository, 'save').mockResolvedValue({
      ...configEntity,
      maintenanceMode: true,
    });
    jest.spyOn(currencyRepository, 'findOne').mockResolvedValue(usdCurrency);
    jest.spyOn(currencyRepository, 'save').mockResolvedValue({
      ...usdCurrency,
      isActive: false,
    });
    jest
      .spyOn(currencyRepository, 'find')
      .mockResolvedValue([{ ...usdCurrency, isActive: false }]);
    jest.spyOn(feeConfigRepository, 'findOne').mockResolvedValue(feeConfig);
    jest.spyOn(feeConfigRepository, 'save').mockResolvedValue({
      ...feeConfig,
      feeValue: '2',
    });
    jest
      .spyOn(feeConfigRepository, 'find')
      .mockResolvedValue([{ ...feeConfig, feeValue: '2' }]);

    const result = await service.updatePlatformConfig(superAdminUser.id, {
      maintenanceMode: true,
      currencies: [{ code: 'usd', isActive: false }],
      feeConfigs: [{ id: feeConfig.id, feeValue: 2 }],
    });

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(result.maintenanceMode).toBe(true);
    expect(result.currencies[0].isActive).toBe(false);
    expect(result.feeConfigs[0].feeValue).toBe('2');
    expect(auditLogsService.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: superAdminUser.id,
        metadata: expect.objectContaining({
          actorRole: UserRole.SUPER_ADMIN,
          previous: {
            maintenanceMode: false,
            currencies: [{ code: 'USD', isActive: true }],
            feeConfigs: [
              expect.objectContaining({
                id: feeConfig.id,
                feeValue: '1.5',
              }),
            ],
          },
          new: {
            maintenanceMode: true,
            currencies: [{ code: 'USD', isActive: false }],
            feeConfigs: [
              expect.objectContaining({
                id: feeConfig.id,
                feeValue: '2',
              }),
            ],
          },
        }),
      }),
    );
  });

  it('leaves maintenanceMode and the first currency unchanged when the second currency code is unknown', async () => {
    const configEntity = {
      id: 'platform-config-id',
      maintenanceMode: false,
    } as PlatformConfig;
    const usdCurrency = {
      id: 'currency-usd',
      code: 'USD',
      isActive: true,
      isBase: false,
    } as Currency;

    jest.spyOn(usersService, 'findById').mockResolvedValue(superAdminUser);
    jest
      .spyOn(platformConfigRepository, 'findOne')
      .mockResolvedValue(configEntity);
    jest
      .spyOn(currencyRepository, 'findOne')
      .mockImplementation(async (opts: any) => {
        if (opts?.where?.code === 'USD') return usdCurrency;
        return null;
      });

    await expect(
      service.updatePlatformConfig(superAdminUser.id, {
        maintenanceMode: true,
        currencies: [
          { code: 'USD', isActive: false },
          { code: 'UNKNOWN', isActive: true },
        ],
      }),
    ).rejects.toThrow(NotFoundException);

    expect(configEntity.maintenanceMode).toBe(false);
    expect(usdCurrency.isActive).toBe(true);
    expect(platformConfigRepository.save).not.toHaveBeenCalled();
    expect(currencyRepository.save).not.toHaveBeenCalled();
    expect(auditLogsService.createLog).not.toHaveBeenCalled();
  });

  it('throws when a requested fee config does not exist without persisting partial updates', async () => {
    const configEntity = {
      id: 'platform-config-id',
      maintenanceMode: false,
    } as PlatformConfig;
    jest.spyOn(usersService, 'findById').mockResolvedValue(superAdminUser);
    jest
      .spyOn(platformConfigRepository, 'findOne')
      .mockResolvedValue(configEntity);
    jest.spyOn(feeConfigRepository, 'findOne').mockResolvedValue(null);

    await expect(
      service.updatePlatformConfig(superAdminUser.id, {
        maintenanceMode: true,
        feeConfigs: [{ id: 'missing-fee-config', feeValue: 3 }],
      }),
    ).rejects.toThrow(NotFoundException);

    expect(configEntity.maintenanceMode).toBe(false);
    expect(platformConfigRepository.save).not.toHaveBeenCalled();
    expect(auditLogsService.createLog).not.toHaveBeenCalled();
  });
});
