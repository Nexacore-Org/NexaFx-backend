import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

  const standardUser = {
    id: 'standard-user-id',
    email: 'user@nexafx.test',
    role: UserRole.USER,
    referralCode: 'USER0001',
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
            find: jest.fn(),
            create: jest.fn((value) => value),
            save: jest.fn(),
          },
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

  it('creates an ADMIN user and records a privileged audit log', async () => {
    jest.spyOn(usersService, 'findById').mockImplementation(async (userId) => {
      if (userId === superAdminUser.id) return superAdminUser;
      if (userId === adminUser.id)
        return { ...adminUser, isVerified: true } as User;
      return null;
    });
    jest.spyOn(userRepository, 'findOne').mockResolvedValueOnce(null);
    jest.spyOn(usersService, 'createUser').mockResolvedValue({
      ...adminUser,
      role: UserRole.ADMIN,
    });

    const result = await service.createAdmin(superAdminUser.id, {
      email: adminUser.email,
      password: 'P@ssword123',
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
    jest.spyOn(usersService, 'findById').mockResolvedValue(superAdminUser);

    await expect(
      service.updateManagedAdminRole(superAdminUser.id, superAdminUser.id, {
        role: UserRole.ADMIN,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('prevents demoting the last SUPER_ADMIN', async () => {
    jest.spyOn(usersService, 'findById').mockImplementation(async (userId) => {
      if (userId === superAdminUser.id) return superAdminUser;
      if (userId === adminUser.id)
        return { ...adminUser, role: UserRole.SUPER_ADMIN } as User;
      return null;
    });
    jest.spyOn(userRepository, 'count').mockResolvedValue(1);

    await expect(
      service.updateManagedAdminRole(superAdminUser.id, adminUser.id, {
        role: UserRole.ADMIN,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('updates platform config and returns a combined snapshot', async () => {
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
      .spyOn(platformConfigRepository, 'find')
      .mockResolvedValue([maintenanceConfig]);
    jest.spyOn(platformConfigRepository, 'save').mockResolvedValue({
      ...maintenanceConfig,
      maintenanceMode: true,
    } as PlatformConfig);
    jest.spyOn(currencyRepository, 'findOne').mockResolvedValue(usdCurrency);
    jest.spyOn(currencyRepository, 'save').mockResolvedValue({
      ...usdCurrency,
      isActive: false,
    } as Currency);
    jest
      .spyOn(currencyRepository, 'find')
      .mockResolvedValue([{ ...usdCurrency, isActive: false } as Currency]);
    jest.spyOn(feeConfigRepository, 'findOne').mockResolvedValue(feeConfig);
    jest.spyOn(feeConfigRepository, 'save').mockResolvedValue({
      ...feeConfig,
      feeValue: '2',
    } as FeeConfig);
    jest
      .spyOn(feeConfigRepository, 'find')
      .mockResolvedValue([{ ...feeConfig, feeValue: '2' } as FeeConfig]);

    const result = await service.updatePlatformConfig(superAdminUser.id, {
      maintenanceMode: true,
      currencies: [{ code: 'usd', isActive: false }],
      feeConfigs: [{ id: feeConfig.id, feeValue: 2 }],
    });

    expect(result.maintenanceMode).toBe(true);
    expect(result.currencies[0].isActive).toBe(false);
    expect(result.feeConfigs[0].feeValue).toBe('2');
    expect(auditLogsService.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: superAdminUser.id,
        metadata: expect.objectContaining({
          actorRole: UserRole.SUPER_ADMIN,
        }),
      }),
    );
  });

  it('throws when a requested fee config does not exist', async () => {
    jest.spyOn(usersService, 'findById').mockResolvedValue(superAdminUser);
    jest
      .spyOn(platformConfigRepository, 'find')
      .mockResolvedValue([maintenanceConfig]);
    jest.spyOn(feeConfigRepository, 'findOne').mockResolvedValue(null);

    await expect(
      service.updatePlatformConfig(superAdminUser.id, {
        feeConfigs: [{ id: 'missing-fee-config', feeValue: 3 }],
      }),
    ).rejects.toThrow(NotFoundException);
  });
});
