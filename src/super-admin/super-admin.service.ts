import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
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
import {
  UpdateManagedAdminRoleDto,
} from './dto/update-managed-admin-role.dto';
import { UpdatePlatformConfigDto } from './dto/update-platform-config.dto';
import { PlatformConfig } from './entities/platform-config.entity';

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
  ) {}

  async createAdmin(
    actorUserId: string,
    dto: CreateManagedAdminDto,
  ): Promise<Omit<User, 'password' | 'walletSecretKeyEncrypted' | 'twoFactorSecret'>> {
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
  ): Promise<Omit<User, 'password' | 'walletSecretKeyEncrypted' | 'twoFactorSecret'>> {
    const actor = await this.requireSuperAdmin(actorUserId);
    const target = await this.requireUser(targetUserId);

    if (actor.id === target.id) {
      throw new ForbiddenException(
        'SUPER_ADMIN role changes are not self-service',
      );
    }

    if (![UserRole.USER, UserRole.ADMIN, UserRole.SUPER_ADMIN].includes(dto.role)) {
      throw new BadRequestException('Unsupported managed role');
    }

    if (target.role === dto.role) {
      return this.sanitizeUser(target);
    }

    await this.assertSuperAdminDemotionSafety(target, dto.role);

    const previousRole = target.role;
    target.role = dto.role;
    const savedUser = await this.userRepository.save(target);

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
  ): Promise<Omit<User, 'password' | 'walletSecretKeyEncrypted' | 'twoFactorSecret'>> {
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
    const config = await this.getOrCreatePlatformConfig();

    if (dto.maintenanceMode !== undefined) {
      config.maintenanceMode = dto.maintenanceMode;
      await this.platformConfigRepository.save(config);
    }

    if (dto.currencies?.length) {
      for (const currencyUpdate of dto.currencies) {
        const currency = await this.currencyRepository.findOne({
          where: { code: currencyUpdate.code.toUpperCase() },
        });

        if (!currency) {
          throw new NotFoundException(
            `Currency '${currencyUpdate.code}' not found`,
          );
        }

        currency.isActive = currencyUpdate.isActive;
        await this.currencyRepository.save(currency);
      }
    }

    if (dto.feeConfigs?.length) {
      for (const feeUpdate of dto.feeConfigs) {
        const feeConfig = await this.feeConfigRepository.findOne({
          where: { id: feeUpdate.id },
        });

        if (!feeConfig) {
          throw new NotFoundException(
            `Fee config with ID '${feeUpdate.id}' not found`,
          );
        }

        if (feeUpdate.feeType !== undefined) {
          feeConfig.feeType = feeUpdate.feeType;
        }
        if (feeUpdate.feeValue !== undefined) {
          feeConfig.feeValue = feeUpdate.feeValue.toString();
        }
        if (feeUpdate.minFee !== undefined) {
          feeConfig.minFee = feeUpdate.minFee.toString();
        }
        if (feeUpdate.maxFee !== undefined) {
          feeConfig.maxFee = feeUpdate.maxFee.toString();
        }
        if (feeUpdate.isActive !== undefined) {
          feeConfig.isActive = feeUpdate.isActive;
        }

        if (
          feeConfig.minFee !== null &&
          feeConfig.maxFee !== null &&
          parseFloat(feeConfig.minFee) > parseFloat(feeConfig.maxFee)
        ) {
          throw new BadRequestException(
            'minFee cannot be greater than maxFee',
          );
        }

        await this.feeConfigRepository.save(feeConfig);
      }
    }

    const snapshot = await this.getPlatformConfigSnapshot();

    await this.auditLogsService.createLog({
      userId: actor.id,
      action: AuditAction.PLATFORM_CONFIG_UPDATED,
      entity: AuditEntityType.SYSTEM,
      entityId: config.id,
      metadata: {
        actorRole: actor.role,
        maintenanceMode: snapshot.maintenanceMode,
        updatedFeeConfigIds: dto.feeConfigs?.map((item) => item.id) ?? [],
        updatedCurrencies:
          dto.currencies?.map((item) => ({
            code: item.code.toUpperCase(),
            isActive: item.isActive,
          })) ?? [],
      },
      isSensitive: true,
    });

    return snapshot;
  }

  private async requireSuperAdmin(actorUserId: string): Promise<User> {
    const actor = await this.requireUser(actorUserId);

    if (actor.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('SUPER_ADMIN role required');
    }

    return actor;
  }

  private async requireUser(userId: string): Promise<User> {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  private async assertSuperAdminDemotionSafety(
    target: User,
    nextRole: UserRole,
  ): Promise<void> {
    if (
      target.role === UserRole.SUPER_ADMIN &&
      nextRole !== UserRole.SUPER_ADMIN
    ) {
      const totalSuperAdmins = await this.userRepository.count({
        where: { role: UserRole.SUPER_ADMIN },
      });

      if (totalSuperAdmins <= 1) {
        throw new BadRequestException(
          'Cannot demote the last SUPER_ADMIN',
        );
      }
    }
  }

  private async getOrCreatePlatformConfig(): Promise<PlatformConfig> {
    const [existingConfig] = await this.platformConfigRepository.find({
      order: { createdAt: 'ASC' },
      take: 1,
    });

    if (existingConfig) {
      return existingConfig;
    }

    const created = this.platformConfigRepository.create({
      maintenanceMode: false,
    });

    return this.platformConfigRepository.save(created);
  }

  private async getPlatformConfigSnapshot() {
    const [config, feeConfigs, currencies] = await Promise.all([
      this.getOrCreatePlatformConfig(),
      this.feeConfigRepository.find({
        order: { transactionType: 'ASC', currency: 'ASC' },
      }),
      this.currencyRepository.find({
        order: { isBase: 'DESC', code: 'ASC' },
      }),
    ]);

    return {
      maintenanceMode: config.maintenanceMode,
      feeConfigs,
      currencies,
    };
  }

  private sanitizeUser(
    user: User,
  ): Omit<User, 'password' | 'walletSecretKeyEncrypted' | 'twoFactorSecret'> {
    const {
      password,
      walletSecretKeyEncrypted,
      twoFactorSecret,
      ...safeUser
    } = user;

    return safeUser;
  }

  private async generateUniqueReferralCode(): Promise<string> {
    const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const codeLength = 8;

    for (let attempt = 0; attempt < 20; attempt += 1) {
      let code = '';

      for (let index = 0; index < codeLength; index += 1) {
        code += characters[Math.floor(Math.random() * characters.length)];
      }

      const existingUser = await this.userRepository.findOne({
        where: { referralCode: code },
      });

      if (!existingUser) {
        return code;
      }
    }

    throw new BadRequestException(
      'Unable to generate referral code. Please try again.',
    );
  }
}
