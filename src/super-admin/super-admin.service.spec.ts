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
  let usersService: UsersService;
  let auditLogsService: AuditLogsService;
  let manager: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let dataSource: { transaction: jest.Mock };

  const superAdminUser = Object.assign(new User(), {
    id: 'super-admin-id',
    email: 'super-admin@nexafx.test',
    role: UserRole.SUPER_ADMIN,
    referralCode: 'SUPER001',
    isVerified: true,
    isSuspended: false,
    isDeleted: false,
  });

  const adminUser = Object.assign(new User(), {
    id: 'admin-user-id',
    email: 'admin@nexafx.test',
    role: UserRole.ADMIN,
    referralCode: 'ADMIN001',
    isVerified: true,
    isSuspended: false,
    isDeleted: false,
  });

  beforeEach(async () => {
    manager = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((_entity, values) => values),
      save: jest.fn(async (_entity, entity) => entity),
    };
    dataSource = {
      transaction: jest.fn((work) => work(manager)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SuperAdminService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn().mockResolvedValue(superAdminUser),
            count: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Currency),
          useValue: { findOne: jest.fn(), find: jest.fn(), save: jest.fn() },
        },
        {
          provide: getRepositoryToken(FeeConfig),
          useValue: { findOne: jest.fn(), find: jest.fn(), save: jest.fn() },
        },
        {
          provide: getRepositoryToken(PlatformConfig),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn((value) => value),
            save: jest.fn(),
          },
        },
        { provide: DataSource, useValue: dataSource },
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
          useValue: { encrypt: jest.fn().mockReturnValue('encrypted-secret') },
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
    usersService = module.get<UsersService>(UsersService);
    auditLogsService = module.get<AuditLogsService>(AuditLogsService);
  });

  it('creates an ADMIN user and records a privileged audit log', async () => {
    jest
      .spyOn(userRepository, 'findOne')
      .mockImplementation(async (options) => {
        const where = Array.isArray(options.where)
          ? options.where[0]
          : options.where;
        if (where && 'id' in where) {
          return where.id === superAdminUser.id
            ? superAdminUser
            : adminUser;
        }
        return null;
      });
    jest.spyOn(usersService, 'createUser').mockResolvedValue(adminUser);

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
    await expect(
      service.updateManagedAdminRole(superAdminUser.id, superAdminUser.id, {
        role: UserRole.ADMIN,
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('prevents demoting the last active SUPER_ADMIN under a row lock', async () => {
    const target = Object.assign(new User(), {
      ...adminUser,
      role: UserRole.SUPER_ADMIN,
    });
    manager.find.mockResolvedValue([target]);
    manager.findOne.mockResolvedValue(target);

    await expect(
      service.updateManagedAdminRole(superAdminUser.id, target.id, {
        role: UserRole.ADMIN,
      }),
    ).rejects.toThrow(BadRequestException);

    expect(manager.find).toHaveBeenCalledWith(
      User,
      expect.objectContaining({
        where: {
          role: UserRole.SUPER_ADMIN,
          isSuspended: false,
          isDeleted: false,
        },
        lock: { mode: 'pessimistic_write' },
      }),
    );
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('removes all class-transformer excluded fields from role-change responses', async () => {
    const target = Object.assign(new User(), {
      ...adminUser,
      role: UserRole.SUPER_ADMIN,
      pendingTwoFactorSecret: 'pending-secret',
      password: 'password',
      walletSecretKeyEncrypted: 'encrypted-wallet-secret',
      twoFactorSecret: 'active-secret',
    });
    const otherActiveSuperAdmin = Object.assign(new User(), {
      id: 'other-super-admin',
      role: UserRole.SUPER_ADMIN,
      isSuspended: false,
      isDeleted: false,
    });
    manager.find.mockResolvedValue([target, otherActiveSuperAdmin]);
    manager.findOne.mockResolvedValue(target);

    const result = await service.updateManagedAdminRole(
      superAdminUser.id,
      target.id,
      { role: UserRole.ADMIN },
    );

    expect(result.role).toBe(UserRole.ADMIN);
    expect(result).not.toHaveProperty('pendingTwoFactorSecret');
    expect(result).not.toHaveProperty('password');
    expect(result).not.toHaveProperty('walletSecretKeyEncrypted');
    expect(result).not.toHaveProperty('twoFactorSecret');
  });

  it('updates config atomically and audits previous and new values', async () => {
    const config = Object.assign(new PlatformConfig(), {
      id: 'platform-config-id',
      key: 'maintenanceMode',
      category: 'system',
      value: { maintenanceMode: false },
    });
    const currency = Object.assign(new Currency(), {
      id: 'currency-usd',
      code: 'USD',
      isActive: true,
    });
    const feeConfig = Object.assign(new FeeConfig(), {
      id: 'fee-config-id',
      transactionType: FeeTransactionType.DEPOSIT,
      currency: 'USD',
      feeType: FeeType.FLAT,
      feeValue: '1.5',
      minFee: null,
      maxFee: null,
      isActive: true,
    });
    manager.findOne.mockImplementation(async (entity, options) => {
      if (entity === PlatformConfig) return config;
      if (entity === Currency && options.where.code === 'USD') return currency;
      if (entity === FeeConfig && options.where.id === feeConfig.id) {
        return feeConfig;
      }
      return null;
    });

    const result = await service.updatePlatformConfig(superAdminUser.id, {
      maintenanceMode: true,
      currencies: [{ code: 'usd', isActive: false }],
      feeConfigs: [{ id: feeConfig.id, feeValue: 2 }],
    });

    expect(result.maintenanceMode).toBe(true);
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(manager.save).toHaveBeenCalledTimes(3);
    expect(auditLogsService.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: superAdminUser.id,
        metadata: expect.objectContaining({
          maintenanceMode: { before: false, after: true },
          currencies: [
            {
              code: 'USD',
              before: { isActive: true },
              after: { isActive: false },
            },
          ],
          feeConfigs: [
            {
              id: feeConfig.id,
              before: expect.objectContaining({ feeValue: '1.5' }),
              after: expect.objectContaining({ feeValue: '2' }),
            },
          ],
        }),
      }),
    );
  });

  it('does not save earlier config changes when a later currency is missing', async () => {
    const config = Object.assign(new PlatformConfig(), {
      id: 'platform-config-id',
      key: 'maintenanceMode',
      category: 'system',
      value: { maintenanceMode: false },
    });
    const currency = Object.assign(new Currency(), {
      id: 'currency-usd',
      code: 'USD',
      isActive: true,
    });
    manager.findOne.mockImplementation(async (entity, options) => {
      if (entity === PlatformConfig) return config;
      if (entity === Currency && options.where.code === 'USD') return currency;
      return null;
    });

    await expect(
      service.updatePlatformConfig(superAdminUser.id, {
        maintenanceMode: true,
        currencies: [
          { code: 'USD', isActive: false },
          { code: 'MISSING', isActive: true },
        ],
      }),
    ).rejects.toThrow(NotFoundException);

    expect(manager.save).not.toHaveBeenCalled();
    expect(auditLogsService.createLog).not.toHaveBeenCalled();
  });

  it('does not save config changes when a fee range is invalid', async () => {
    const config = Object.assign(new PlatformConfig(), {
      id: 'platform-config-id',
      key: 'maintenanceMode',
      category: 'system',
      value: { maintenanceMode: false },
    });
    const feeConfig = Object.assign(new FeeConfig(), {
      id: 'fee-config-id',
      feeType: FeeType.FLAT,
      feeValue: '1',
      minFee: '0',
      maxFee: '10',
      isActive: true,
    });
    manager.findOne.mockImplementation(async (entity) => {
      if (entity === PlatformConfig) return config;
      if (entity === FeeConfig) return feeConfig;
      return null;
    });

    await expect(
      service.updatePlatformConfig(superAdminUser.id, {
        maintenanceMode: true,
        feeConfigs: [{ id: feeConfig.id, minFee: 20 }],
      }),
    ).rejects.toThrow(BadRequestException);

    expect(manager.save).not.toHaveBeenCalled();
    expect(auditLogsService.createLog).not.toHaveBeenCalled();
  });

  it('throws when a requested fee config does not exist', async () => {
    const config = Object.assign(new PlatformConfig(), {
      id: 'platform-config-id',
      key: 'maintenanceMode',
      category: 'system',
      value: { maintenanceMode: false },
    });
    manager.findOne.mockImplementation(async (entity) =>
      entity === PlatformConfig ? config : null,
    );

    await expect(
      service.updatePlatformConfig(superAdminUser.id, {
        feeConfigs: [{ id: 'missing-fee-config', feeValue: 3 }],
      }),
    ).rejects.toThrow(NotFoundException);
    expect(manager.save).not.toHaveBeenCalled();
  });
});
