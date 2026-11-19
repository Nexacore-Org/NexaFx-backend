import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { instanceToPlain } from 'class-transformer';
import { DataSource, Repository } from 'typeorm';
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
    private readonly dataSource: DataSource,
  ) {}

  async createAdmin(
    actorUserId: string,
    dto: CreateManagedAdminDto,
  ): Promise<
    Omit<User, 'password' | 'walletSecretKeyEncrypted' | 'twoFactorSecret'>
  > {
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
  ): Promise<
    Omit<User, 'password' | 'walletSecretKeyEncrypted' | 'twoFactorSecret'>
  > {
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

    const result = await this.dataSource.transaction(async (manager) => {
      const users = manager.getRepository(User);
      const superAdmins = await users.find({
        where: { role: UserRole.SUPER_ADMIN },
        lock: { mode: 'pessimistic_write' },
      });
      const target = await users.findOne({
        where: { id: targetUserId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!target) {
        throw new NotFoundException('User not found');
      }

      if (target.role === dto.role) {
        return { user: target, previousRole: target.role, changed: false };
      }

      this.assertSuperAdminDemotionSafety(target, dto.role, superAdmins);

      const previousRole = target.role;
      target.role = dto.role;
      const savedUser = await users.save(target);

      return { user: savedUser, previousRole, changed: true };
    });

    if (result.changed) {
      await this.auditLogsService.createLog({
        userId: actor.id,
        action: AuditAction.ROLE_CHANGE,
        entity: AuditEntityType.USER,
        entityId: result.user.id,
        metadata: {
          actorRole: actor.role,
          targetEmail: result.user.email,
          oldRole: result.previousRole,
          newRole: result.user.role,
        },
        isSensitive: true,
      });
    }

    return this.sanitizeUser(result.user);
  }

  async demoteAdmin(
    actorUserId: string,
    targetUserId: string,
  ): Promise<
    Omit<User, 'password' | 'walletSecretKeyEncrypted' | 'twoFactorSecret'>
  > {
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
    const { snapshot, before, after } = await this.dataSource.transaction(
      async (manager) => {
        const configRepository = manager.getRepository(PlatformConfig);
        const currencyRepository = manager.getRepository(Currency);
        const feeConfigRepository = manager.getRepository(FeeConfig);

        const currencyChanges: {
          currency: Currency;
          before: { code: string; isActive: boolean };
          after: { code: string; isActive: boolean };
        }[] = [];
        for (const currencyUpdate of dto.currencies ?? []) {
          const currency = await currencyRepository.findOne({
            where: { code: currencyUpdate.code.toUpperCase() },
          });
          if (!currency) {
            throw new NotFoundException(
              `Currency '${currencyUpdate.code}' not found`,
            );
          }

          currencyChanges.push({
            currency,
            before: { code: currency.code, isActive: currency.isActive },
            after: {
              code: currency.code,
              isActive: currencyUpdate.isActive,
            },
          });
        }

        const feeConfigChanges: {
          feeConfig: FeeConfig;
          before: Omit<FeeConfig, 'createdAt' | 'updatedAt'>;
          after: Omit<FeeConfig, 'createdAt' | 'updatedAt'>;
        }[] = [];
        for (const feeUpdate of dto.feeConfigs ?? []) {
          const feeConfig = await feeConfigRepository.findOne({
            where: { id: feeUpdate.id },
          });
          if (!feeConfig) {
            throw new NotFoundException(
              `Fee config with ID '${feeUpdate.id}' not found`,
            );
          }

          const before = {
            id: feeConfig.id,
            transactionType: feeConfig.transactionType,
            currency: feeConfig.currency,
            feeType: feeConfig.feeType,
            feeValue: feeConfig.feeValue,
            minFee: feeConfig.minFee,
            maxFee: feeConfig.maxFee,
            isActive: feeConfig.isActive,
          };
          const updated = { ...before };
          if (feeUpdate.feeType !== undefined) {
            updated.feeType = feeUpdate.feeType;
          }
          if (feeUpdate.feeValue !== undefined) {
            updated.feeValue = feeUpdate.feeValue.toString();
          }
          if (feeUpdate.minFee !== undefined) {
            updated.minFee = feeUpdate.minFee.toString();
          }
          if (feeUpdate.maxFee !== undefined) {
            updated.maxFee = feeUpdate.maxFee.toString();
          }
          if (feeUpdate.isActive !== undefined) {
            updated.isActive = feeUpdate.isActive;
          }

          if (
            updated.minFee !== null &&
            updated.maxFee !== null &&
            parseFloat(updated.minFee) > parseFloat(updated.maxFee)
          ) {
            throw new BadRequestException(
              'minFee cannot be greater than maxFee',
            );
          }

          feeConfigChanges.push({ feeConfig, before, after: updated });
        }

        const config = await this.getOrCreatePlatformConfig(configRepository);
        const previousMaintenanceMode = config.maintenanceMode;
        if (dto.maintenanceMode !== undefined) {
          config.maintenanceMode = dto.maintenanceMode;
          await configRepository.save(config);
        }

        for (const change of currencyChanges) {
          change.currency.isActive = change.after.isActive;
          await currencyRepository.save(change.currency);
        }

        for (const change of feeConfigChanges) {
          Object.assign(change.feeConfig, change.after);
          await feeConfigRepository.save(change.feeConfig);
        }

        return {
          snapshot: config,
          before: {
            maintenanceMode: previousMaintenanceMode,
            currencies: currencyChanges.map((change) => change.before),
            feeConfigs: feeConfigChanges.map((change) => change.before),
          },
          after: {
            maintenanceMode: config.maintenanceMode,
            currencies: currencyChanges.map((change) => change.after),
            feeConfigs: feeConfigChanges.map((change) => change.after),
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
        before,
        after,
      },
      isSensitive: true,
    });

    return snapshot;
  }

  async getOrCreatePlatformConfig(
    repository: Repository<PlatformConfig> = this.platformConfigRepository,
  ): Promise<PlatformConfig> {
    const existing = await repository.findOne({
      where: {},
      order: { createdAt: 'ASC' },
    });

    if (existing) {
      return existing;
    }

    const created = repository.create({
      key: 'maintenanceMode',
      category: 'system',
      value: { maintenanceMode: false },
    });

    return repository.save(created);
  }

  private async requireSuperAdmin(userId: string): Promise<User> {
    const user = await this.requireUser(userId);

    if (user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('SUPER_ADMIN privileges required');
    }

    return user;
  }

  private async requireUser(userId: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  private assertSuperAdminDemotionSafety(
    target: User,
    nextRole: UserRole,
    superAdmins: User[],
  ): void {
    if (
      target.role !== UserRole.SUPER_ADMIN ||
      nextRole === UserRole.SUPER_ADMIN
    ) {
      return;
    }

    const superAdminCount = superAdmins.filter(
      (user) => !user.isSuspended && !user.isDeleted,
    ).length;

    if (superAdminCount <= 1) {
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

  private sanitizeUser(
    user: User,
  ): Omit<User, 'password' | 'walletSecretKeyEncrypted' | 'twoFactorSecret'> {
    return instanceToPlain(user) as Omit<
      User,
      'password' | 'walletSecretKeyEncrypted' | 'twoFactorSecret'
    >;
  }
}
