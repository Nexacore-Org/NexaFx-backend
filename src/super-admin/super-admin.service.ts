import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { instanceToPlain } from 'class-transformer';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditEntityType } from '../audit-logs/enums/audit-entity-type.enum';
import { AuditAction } from '../audit-logs/enums/audit-action.enum';
import { GetAuditLogsDto } from '../audit-logs/dto/get-audit-logs.dto';
import { EncryptionService } from '../common/services/encryption.service';
import { Currency } from '../currencies/currency.entity';
import { FeeConfig } from '../fees/entities/fee-config.entity';
import { StellarService } from '../blockchain/stellar/stellar.service';
import { UsersService } from '../users/users.service';
import { User, UserRole } from '../users/user.entity';
import { CreateManagedAdminDto } from './dto/create-managed-admin.dto';
import { UpdateManagedAdminRoleDto } from './dto/update-managed-admin-role.dto';
import { UpdatePlatformConfigDto } from './dto/update-platform-config.dto';
import { PlatformConfig } from './entities/platform-config.entity';
import { WalletsService } from '../wallets/wallets.service';

export type SanitizedUser = Omit<
  User,
  | 'password'
  | 'walletSecretKeyEncrypted'
  | 'twoFactorSecret'
  | 'pendingTwoFactorSecret'
>;

interface ScopedRepositories {
  userRepo: Repository<User>;
  currencyRepo: Repository<Currency>;
  feeConfigRepo: Repository<FeeConfig>;
  platformConfigRepo: Repository<PlatformConfig>;
}

@Injectable()
export class SuperAdminService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Currency)
    private readonly currencyRepository: Repository<Currency>,
    @InjectRepository(FeeConfig)
    private readonly feeConfigRepository: Repository<FeeConfig>,
    @InjectRepository(PlatformConfig)
    private readonly platformConfigRepository: Repository<PlatformConfig>,
    private readonly usersService: UsersService,
    private readonly stellarService: StellarService,
    private readonly encryptionService: EncryptionService,
    private readonly auditLogsService: AuditLogsService,
    private readonly walletsService: WalletsService,
    @Optional()
    private readonly dataSource?: DataSource,
  ) {}

  private resolveRepositories(manager?: EntityManager): ScopedRepositories {
    const getRepo = <T extends object>(
      entity: new () => T,
      fallback: Repository<T>,
    ): Repository<T> => {
      if (manager && typeof manager.getRepository === 'function') {
        const repo = manager.getRepository(entity);
        if (repo) {
          return repo;
        }
      }
      return fallback;
    };

    return {
      userRepo: getRepo(User, this.userRepository),
      currencyRepo: getRepo(Currency, this.currencyRepository),
      feeConfigRepo: getRepo(FeeConfig, this.feeConfigRepository),
      platformConfigRepo: getRepo(
        PlatformConfig,
        this.platformConfigRepository,
      ),
    };
  }

  private async runInTransaction<T>(
    work: (repos: ScopedRepositories, manager?: EntityManager) => Promise<T>,
  ): Promise<T> {
    if (this.dataSource && typeof this.dataSource.transaction === 'function') {
      return this.dataSource.transaction(async (manager) =>
        work(this.resolveRepositories(manager), manager),
      );
    }

    return work(this.resolveRepositories());
  }

  async createAdmin(
    actorUserId: string,
    dto: CreateManagedAdminDto,
  ): Promise<SanitizedUser> {
    const actor = await this.requireSuperAdmin(actorUserId);
    const role = dto.role ?? UserRole.ADMIN;

    if (![UserRole.ADMIN, UserRole.SUPER_ADMIN].includes(role)) {
      throw new BadRequestException(
        'SUPER_ADMIN can only create ADMIN or SUPER_ADMIN accounts',
      );
    }

    const wallet = await this.stellarService.generateWallet();
    const walletSecretKeyEncrypted = this.encryptionService.encrypt(
      wallet.secretKey,
    );
    const referralCode = await this.generateUniqueReferralCode();

    const createdUser = await this.usersService.createUser({
      email: dto.email,
      password: dto.password,
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone,
      walletPublicKey: wallet.publicKey,
      walletSecretKeyEncrypted,
      referralCode,
      role,
    });

    await this.walletsService.seedPrimaryWalletFromUserCredentials(
      createdUser.id,
      wallet.publicKey,
      walletSecretKeyEncrypted,
    );

    await this.usersService.verifyUser(createdUser.id);

    const persistedUser = await this.requireUser(createdUser.id);

    await this.auditLogsService.createLog({
      userId: actor.id,
      action: AuditAction.ADMIN_ACCOUNT_CREATED,
      entity: AuditEntityType.USER,
      entityId: persistedUser.id,
      metadata: {
        actorRole: actor.role,
        assignedRole: persistedUser.role,
        targetEmail: persistedUser.email,
      },
      isSensitive: true,
    });

    return this.sanitizeUser(persistedUser);
  }

  async updateManagedAdminRole(
    actorUserId: string,
    targetUserId: string,
    dto: UpdateManagedAdminRoleDto,
  ): Promise<SanitizedUser> {
    const actor = await this.requireSuperAdmin(actorUserId);

    if (actor.id === targetUserId) {
      throw new ForbiddenException(
        'SUPER_ADMIN role changes are not self-service',
      );
    }

    if (
      ![UserRole.USER, UserRole.ADMIN, UserRole.SUPER_ADMIN].includes(dto.role)
    ) {
      throw new BadRequestException('Unsupported managed role');
    }

    const { savedUser, previousRole, changed } = await this.runInTransaction(
      async ({ userRepo }) => {
        const target = await this.requireUser(targetUserId, userRepo);

        if (actor.id === target.id) {
          throw new ForbiddenException(
            'SUPER_ADMIN role changes are not self-service',
          );
        }

        if (target.role === dto.role) {
          return {
            savedUser: target,
            previousRole: target.role,
            changed: false,
          };
        }

        await this.assertSuperAdminDemotionSafety(target, dto.role, userRepo);

        const oldRole = target.role;
        target.role = dto.role;
        const updated = (await userRepo.save(target)) ?? target;

        return {
          savedUser: updated,
          previousRole: oldRole,
          changed: true,
        };
      },
    );

    if (!changed) {
      return this.sanitizeUser(savedUser);
    }

    await this.auditLogsService.createLog({
      userId: actor.id,
      action: AuditAction.ROLE_CHANGE,
      entity: AuditEntityType.USER,
      entityId: savedUser.id,
      metadata: {
        actorRole: actor.role,
        targetEmail: savedUser.email,
        oldRole: previousRole,
        newRole: savedUser.role,
      },
      isSensitive: true,
    });

    return this.sanitizeUser(savedUser);
  }

  async demoteAdmin(
    actorUserId: string,
    targetUserId: string,
  ): Promise<SanitizedUser> {
    return this.updateManagedAdminRole(actorUserId, targetUserId, {
      role: UserRole.USER,
    });
  }

  async getAuditLogs(actorUserId: string, filters: GetAuditLogsDto) {
    const actor = await this.requireSuperAdmin(actorUserId);
    const result = await this.auditLogsService.getPrivilegedLogs(filters);

    await this.auditLogsService.createLog({
      userId: actor.id,
      action: AuditAction.SUPER_ADMIN_AUDIT_LOGS_VIEWED,
      entity: AuditEntityType.SYSTEM,
      metadata: {
        actorRole: actor.role,
        filters,
        returnedCount: result.logs.length,
      },
      isSensitive: true,
    });

    return result;
  }

  async updatePlatformConfig(
    actorUserId: string,
    dto: UpdatePlatformConfigDto,
  ) {
    const actor = await this.requireSuperAdmin(actorUserId);

    const { snapshot, previousValues, newValues } = await this.runInTransaction(
      async ({ currencyRepo, feeConfigRepo, platformConfigRepo }) => {
        const config = await this.getOrCreatePlatformConfig(platformConfigRepo);
        const previousMaintenanceMode = Boolean(config.maintenanceMode);
        const nextMaintenanceMode =
          dto.maintenanceMode !== undefined
            ? dto.maintenanceMode
            : previousMaintenanceMode;

        const stagedCurrencies: Array<{
          entity: Currency;
          previous: { code: string; isActive: boolean };
          next: { code: string; isActive: boolean };
        }> = [];

        if (dto.currencies?.length) {
          for (const currencyUpdate of dto.currencies) {
            const normalizedCode = currencyUpdate.code.toUpperCase();
            const currency = await currencyRepo.findOne({
              where: { code: normalizedCode },
            });

            if (!currency) {
              throw new NotFoundException(
                `Currency '${currencyUpdate.code}' not found`,
              );
            }

            stagedCurrencies.push({
              entity: currency,
              previous: {
                code: currency.code,
                isActive: currency.isActive,
              },
              next: {
                code: currency.code,
                isActive: currencyUpdate.isActive,
              },
            });
          }
        }

        const stagedFeeConfigs: Array<{
          entity: FeeConfig;
          previous: {
            id: string;
            feeType: FeeConfig['feeType'];
            feeValue: string;
            minFee: string | null;
            maxFee: string | null;
            isActive: boolean;
          };
          next: {
            id: string;
            feeType: FeeConfig['feeType'];
            feeValue: string;
            minFee: string | null;
            maxFee: string | null;
            isActive: boolean;
          };
        }> = [];

        if (dto.feeConfigs?.length) {
          for (const feeUpdate of dto.feeConfigs) {
            const feeConfig = await feeConfigRepo.findOne({
              where: { id: feeUpdate.id },
            });

            if (!feeConfig) {
              throw new NotFoundException(
                `Fee config with ID '${feeUpdate.id}' not found`,
              );
            }

            const nextFeeType =
              feeUpdate.feeType !== undefined
                ? feeUpdate.feeType
                : feeConfig.feeType;
            const nextFeeValue =
              feeUpdate.feeValue !== undefined
                ? feeUpdate.feeValue.toString()
                : feeConfig.feeValue;
            const nextMinFee =
              feeUpdate.minFee !== undefined
                ? feeUpdate.minFee.toString()
                : feeConfig.minFee;
            const nextMaxFee =
              feeUpdate.maxFee !== undefined
                ? feeUpdate.maxFee.toString()
                : feeConfig.maxFee;
            const nextIsActive =
              feeUpdate.isActive !== undefined
                ? feeUpdate.isActive
                : feeConfig.isActive;

            if (
              nextMinFee !== null &&
              nextMaxFee !== null &&
              parseFloat(nextMinFee) > parseFloat(nextMaxFee)
            ) {
              throw new BadRequestException(
                'minFee cannot be greater than maxFee',
              );
            }

            stagedFeeConfigs.push({
              entity: feeConfig,
              previous: {
                id: feeConfig.id,
                feeType: feeConfig.feeType,
                feeValue: feeConfig.feeValue,
                minFee: feeConfig.minFee,
                maxFee: feeConfig.maxFee,
                isActive: feeConfig.isActive,
              },
              next: {
                id: feeConfig.id,
                feeType: nextFeeType,
                feeValue: nextFeeValue,
                minFee: nextMinFee,
                maxFee: nextMaxFee,
                isActive: nextIsActive,
              },
            });
          }
        }

        // All validations succeeded — apply mutations atomically
        let savedConfig = config;
        if (dto.maintenanceMode !== undefined) {
          config.maintenanceMode = dto.maintenanceMode;
          savedConfig = (await platformConfigRepo.save(config)) ?? config;
        }

        const savedCurrencies: Currency[] = [];
        for (const item of stagedCurrencies) {
          item.entity.isActive = item.next.isActive;
          const saved = (await currencyRepo.save(item.entity)) ?? item.entity;
          savedCurrencies.push(saved);
        }

        const savedFeeConfigs: FeeConfig[] = [];
        for (const item of stagedFeeConfigs) {
          item.entity.feeType = item.next.feeType;
          item.entity.feeValue = item.next.feeValue;
          item.entity.minFee = item.next.minFee;
          item.entity.maxFee = item.next.maxFee;
          item.entity.isActive = item.next.isActive;
          const saved = (await feeConfigRepo.save(item.entity)) ?? item.entity;
          savedFeeConfigs.push(saved);
        }

        const latestConfig =
          (await this.getOrCreatePlatformConfig(platformConfigRepo)) ??
          savedConfig;
        const currenciesList =
          (typeof currencyRepo.find === 'function'
            ? await currencyRepo.find()
            : undefined) ?? savedCurrencies;
        const feeConfigsList =
          (typeof feeConfigRepo.find === 'function'
            ? await feeConfigRepo.find()
            : undefined) ?? savedFeeConfigs;

        return {
          snapshot: {
            ...latestConfig,
            maintenanceMode:
              dto.maintenanceMode !== undefined
                ? dto.maintenanceMode
                : latestConfig.maintenanceMode,
            currencies: currenciesList,
            feeConfigs: feeConfigsList,
          },
          previousValues: {
            maintenanceMode: previousMaintenanceMode,
            currencies: stagedCurrencies.map((c) => c.previous),
            feeConfigs: stagedFeeConfigs.map((f) => f.previous),
          },
          newValues: {
            maintenanceMode: nextMaintenanceMode,
            currencies: stagedCurrencies.map((c) => c.next),
            feeConfigs: stagedFeeConfigs.map((f) => f.next),
          },
        };
      },
    );

    await this.auditLogsService.createLog({
      userId: actor.id,
      action: AuditAction.PLATFORM_CONFIG_UPDATED,
      entity: AuditEntityType.SYSTEM,
      metadata: {
        actorRole: actor.role,
        maintenanceMode: snapshot.maintenanceMode,
        currencies: dto.currencies ?? [],
        feeConfigs: dto.feeConfigs ?? [],
        previous: previousValues,
        new: newValues,
        previousValues,
        newValues,
        before: previousValues,
        after: newValues,
      },
      isSensitive: true,
    });

    return snapshot;
  }

  async getOrCreatePlatformConfig(
    repo: Repository<PlatformConfig> = this.platformConfigRepository,
  ): Promise<PlatformConfig> {
    let existing: PlatformConfig | null = null;
    if (typeof repo.findOne === 'function') {
      existing = await repo.findOne({
        where: {},
        order: { createdAt: 'ASC' },
      });
    }
    if (!existing && typeof repo.find === 'function') {
      const list = await repo.find({
        order: { createdAt: 'ASC' },
      });
      existing = Array.isArray(list) && list.length > 0 ? list[0] : null;
    }

    if (existing) {
      return existing;
    }

    const created = repo.create({
      maintenanceMode: false,
    });

    return (await repo.save(created)) ?? created;
  }

  private async requireSuperAdmin(userId: string): Promise<User> {
    const user = await this.requireUser(userId);

    if (user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('SUPER_ADMIN privileges required');
    }

    return user;
  }

  private async requireUser(
    userId: string,
    userRepo: Repository<User> = this.userRepository,
  ): Promise<User> {
    let user: User | null = null;
    if (typeof userRepo.findOne === 'function') {
      user = await userRepo.findOne({ where: { id: userId } });
    }
    if (!user && typeof this.usersService?.findById === 'function') {
      user = await this.usersService.findById(userId);
    }

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  private async assertSuperAdminDemotionSafety(
    target: User,
    nextRole: UserRole,
    userRepo: Repository<User> = this.userRepository,
  ): Promise<void> {
    if (
      target.role !== UserRole.SUPER_ADMIN ||
      nextRole === UserRole.SUPER_ADMIN
    ) {
      return;
    }

    let activeSuperAdminCount: number | undefined;

    if (typeof userRepo.createQueryBuilder === 'function') {
      const qb = userRepo.createQueryBuilder('user');
      if (qb) {
        if (typeof qb.setLock === 'function') {
          qb.setLock('pessimistic_write');
        }
        if (typeof qb.where === 'function') {
          qb.where(
            'user.role = :role AND user.isSuspended = :isSuspended AND user.isDeleted = :isDeleted',
            {
              role: UserRole.SUPER_ADMIN,
              isSuspended: false,
              isDeleted: false,
            },
          );
        }
        if (typeof qb.getMany === 'function') {
          const rows = await qb.getMany();
          if (Array.isArray(rows)) {
            activeSuperAdminCount = rows.filter(
              (u) => !u.isSuspended && !u.isDeleted,
            ).length;
          }
        } else if (typeof qb.getCount === 'function') {
          const count = await qb.getCount();
          if (typeof count === 'number') {
            activeSuperAdminCount = count;
          }
        }
      }
    }

    if (
      activeSuperAdminCount === undefined &&
      typeof userRepo.find === 'function'
    ) {
      const rows = await userRepo.find({
        where: {
          role: UserRole.SUPER_ADMIN,
          isSuspended: false,
          isDeleted: false,
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (Array.isArray(rows)) {
        activeSuperAdminCount = rows.filter(
          (u) => !u.isSuspended && !u.isDeleted,
        ).length;
      }
    }

    if (
      activeSuperAdminCount === undefined &&
      typeof userRepo.count === 'function'
    ) {
      activeSuperAdminCount = await userRepo.count({
        where: {
          role: UserRole.SUPER_ADMIN,
          isSuspended: false,
          isDeleted: false,
        },
      });
    }

    if ((activeSuperAdminCount ?? 0) <= 1) {
      throw new BadRequestException(
        'Cannot demote the last remaining SUPER_ADMIN',
      );
    }
  }

  private async generateUniqueReferralCode(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = await bcrypt
        .genSalt(6)
        .then((salt) => salt.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8));

      const existing = await this.userRepository.findOne({
        where: { referralCode: candidate },
      });

      if (!existing) {
        return candidate;
      }
    }

    throw new BadRequestException('Unable to generate a unique referral code');
  }

  private sanitizeUser(user: User): SanitizedUser {
    const entity =
      user instanceof User ? user : Object.assign(new User(), user);
    const plain = instanceToPlain(entity) as Record<string, unknown>;
    delete plain.password;
    delete plain.walletSecretKeyEncrypted;
    delete plain.twoFactorSecret;
    delete plain.pendingTwoFactorSecret;
    return plain as SanitizedUser;
  }
}
