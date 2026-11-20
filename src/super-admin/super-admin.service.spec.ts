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

jest.mock('../blockchain/stellar/stellar.service', () => ({
  StellarService: class StellarService {},
}));
jest.mock('../wallets/wallets.service', () => ({
  WalletsService: class WalletsService {},
}));

describe('SuperAdminService', () => {
  let service: SuperAdminService;
  let userRepository: Repository<User>;
  let feeConfigRepository: Repository<FeeConfig>;
  let currencyRepository: Repository<Currency>;
  let platformConfigRepository: Repository<PlatformConfig>;
  let dataSource: DataSource;
  let usersService: UsersService;
  let auditLogsService: AuditLogsService;

  const superAdminUser = {
    id: 'super-admin-id',
    email: 'super-admin@nexafx.test',
    role: UserRole.SUPER_ADMIN,
    referralCode: 'SUPER001',
    isVerified: true,
  } as User;

  const adminUser = {
    id: 'admin-user-id',
    email: 'admin@nexafx.test',
    role: UserRole.ADMIN,
    referralCode: 'ADMIN001',
    isVerified: true,
  } as User;

  const maintenanceConfig = {
    id: 'platform-config-id',
    maintenanceMode: false,
  } as PlatformConfig;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SuperAdminService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            count: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Currency),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(FeeConfig),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(PlatformConfig),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn((value) => value),
            save: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: { transaction: jest.fn() },
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
    dataSource = module.get<DataSource>(DataSource);
    jest
      .spyOn(dataSource, 'transaction')
      .mockImplementation((runInTransaction) =>
        runInTransaction({
          getRepository: (entity: unknown) => {
            if (entity === User) return userRepository;
            if (entity === Currency) return currencyRepository;
            if (entity === FeeConfig) return feeConfigRepository;
            if (entity === PlatformConfig) return platformConfigRepository;
            throw new Error('Unexpected repository requested');
          },
        }),
      );
  });

  it('creates an ADMIN user and records a privileged audit log', async () => {
    jest
      .spyOn(userRepository, 'findOne')
      .mockImplementation(async ({ where }) => {
        if (where?.id === superAdminUser.id) return superAdminUser;
        if (where?.id === adminUser.id)
          return { ...adminUser, isVerified: true };
        return null;
      });
    jest.spyOn(usersService, 'createUser').mockResolvedValue({
      ...adminUser,
      role: UserRole.ADMIN,
    });
    jest.spyOn(platformConfigRepository, 'findOne').mockResolvedValue(null);

    const result = await service.createAdmin(superAdminUser.id, {
      email: adminUser.email,
      password: process.env.TEST_ADMIN_PASSWORD ?? 'P@ssword123',
    });

    expect(result.role).toBe(UserRole.ADMIN);
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
    jest.spyOn(userRepository, 'findOne').mockResolvedValue(superAdminUser);

    await expect(
      service.updateManagedAdminRole(superAdminUser.id, superAdminUser.id, {
        role: UserRole.ADMIN,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('prevents demoting the last active SUPER_ADMIN when suspended admins exist', async () => {
    const suspendedActor = { ...superAdminUser, isSuspended: true };
    const target = {
      ...adminUser,
      role: UserRole.SUPER_ADMIN,
      isSuspended: false,
      isDeleted: false,
    } as User;
    jest.spyOn(userRepository, 'find').mockResolvedValue([
      target,
      suspendedActor,
      {
        ...adminUser,
        id: 'suspended-super-admin',
        role: UserRole.SUPER_ADMIN,
        isSuspended: true,
      },
    ]);
    jest
      .spyOn(userRepository, 'findOne')
      .mockImplementation(async ({ where }) => {
        if (where?.id === superAdminUser.id) return suspendedActor;
        if (where?.id === adminUser.id) return target;
        return null;
      });

    await expect(
      service.updateManagedAdminRole(superAdminUser.id, adminUser.id, {
        role: UserRole.ADMIN,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(userRepository.save).not.toHaveBeenCalled();
  });

  it('updates platform config atomically and audits before and after values', async () => {
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

    jest.spyOn(userRepository, 'findOne').mockResolvedValue(superAdminUser);
    jest
      .spyOn(platformConfigRepository, 'findOne')
      .mockResolvedValue(maintenanceConfig);
    jest.spyOn(platformConfigRepository, 'save').mockResolvedValue({
      ...maintenanceConfig,
      maintenanceMode: true,
    });
    jest.spyOn(currencyRepository, 'findOne').mockResolvedValue(usdCurrency);
    jest.spyOn(currencyRepository, 'save').mockResolvedValue({
      ...usdCurrency,
      isActive: false,
    });
    jest.spyOn(feeConfigRepository, 'findOne').mockResolvedValue(feeConfig);
    jest.spyOn(feeConfigRepository, 'save').mockResolvedValue({
      ...feeConfig,
      feeValue: '2',
    });

    const result = await service.updatePlatformConfig(superAdminUser.id, {
      maintenanceMode: true,
      currencies: [{ code: 'usd', isActive: false }],
      feeConfigs: [{ id: feeConfig.id, feeValue: 2 }],
    });

    expect(result.maintenanceMode).toBe(true);
    expect(currencyRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'USD', isActive: false }),
    );
    expect(feeConfigRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ feeValue: '2' }),
    );
    expect(auditLogsService.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: superAdminUser.id,
        metadata: expect.objectContaining({
          actorRole: UserRole.SUPER_ADMIN,
          before: expect.objectContaining({
            maintenanceMode: false,
            currencies: [{ code: 'USD', isActive: true }],
            feeConfigs: [
              expect.objectContaining({ id: feeConfig.id, feeValue: '1.5' }),
            ],
          }),
          after: expect.objectContaining({
            maintenanceMode: true,
            currencies: [{ code: 'USD', isActive: false }],
            feeConfigs: [
              expect.objectContaining({ id: feeConfig.id, feeValue: '2' }),
            ],
          }),
        }),
      }),
    );
    expect(dataSource.transaction).toHaveBeenCalled();
  });

  it('does not save earlier config changes when a later currency is unknown', async () => {
    const firstCurrency = {
      id: 'currency-usd',
      code: 'USD',
      isActive: true,
    } as Currency;
    jest.spyOn(userRepository, 'findOne').mockResolvedValue(superAdminUser);
    jest
      .spyOn(platformConfigRepository, 'findOne')
      .mockResolvedValue(maintenanceConfig);
    jest
      .spyOn(currencyRepository, 'findOne')
      .mockResolvedValueOnce(firstCurrency)
      .mockResolvedValueOnce(null);

    await expect(
      service.updatePlatformConfig(superAdminUser.id, {
        maintenanceMode: true,
        currencies: [
          { code: 'USD', isActive: false },
          { code: 'MISSING', isActive: true },
        ],
      }),
    ).rejects.toThrow(NotFoundException);

    expect(platformConfigRepository.save).not.toHaveBeenCalled();
    expect(currencyRepository.save).not.toHaveBeenCalled();
    expect(firstCurrency.isActive).toBe(true);
    expect(auditLogsService.createLog).not.toHaveBeenCalled();
  });

  it('throws when a requested fee config does not exist', async () => {
    jest.spyOn(userRepository, 'findOne').mockResolvedValue(superAdminUser);
    jest
      .spyOn(platformConfigRepository, 'findOne')
      .mockResolvedValue(maintenanceConfig);
    jest.spyOn(feeConfigRepository, 'findOne').mockResolvedValue(null);

    await expect(
      service.updatePlatformConfig(superAdminUser.id, {
        feeConfigs: [{ id: 'missing-fee-config', feeValue: 3 }],
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('omits pending two-factor secrets from super-admin responses', async () => {
    const target = Object.assign(new User(), {
      ...adminUser,
      password: 'password',
      walletSecretKeyEncrypted: 'wallet-secret',
      twoFactorSecret: 'active-secret',
      pendingTwoFactorSecret: 'pending-secret',
    });
    jest
      .spyOn(userRepository, 'findOne')
      .mockImplementation(async ({ where }) => {
        if (where?.id === superAdminUser.id) return superAdminUser;
        if (where?.id === target.id) return target;
        return null;
      });
    jest.spyOn(userRepository, 'find').mockResolvedValue([]);
    jest.spyOn(userRepository, 'save').mockResolvedValue(target);

    const result = await service.updateManagedAdminRole(
      superAdminUser.id,
      target.id,
      { role: UserRole.USER },
    );

    expect(result).not.toHaveProperty('pendingTwoFactorSecret');
  });
});
