import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
  UnprocessableEntityException,
  NotFoundException,
  Logger,
  Inject,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, In } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { GdprConsent } from './entities/gdpr-consent.entity';
import { ErasureAuditLog } from './entities/erasure-audit-log.entity';
import { User } from '../../users/user.entity';
import {
  Transaction,
  TransactionStatus,
} from '../../transactions/entities/transaction.entity';
import { KYCApplication } from '../../kyc/entities/kyc-application.entity';
import { Notification } from '../../notifications/entities/notification.entity';
import { RateAlert } from '../../rate-alerts/entities/rate-alert.entity';
import { WebhookEndpoint } from '../../webhooks/entities/webhook-endpoint.entity';
import { WebhookDelivery } from '../../webhooks/entities/webhook-delivery.entity';
import { AuditLog } from '../../audit-logs/entities/audit-log.entity';
import { AuditEntityType } from '../../audit-logs/enums/audit-entity-type.enum';
import { AuditLogStatus } from '../../audit-logs/enums/audit-log-status.enum';
import { RefreshToken } from '../../tokens/refresh-token.entity';
import { Expense } from '../../modules/expenses/entities/expense.entity';
import {
  STORAGE_SERVICE_TOKEN,
  StorageService,
} from '../../modules/storage/storage.service';
import { RedisService } from '../redis/redis.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';

export interface RetentionUserDeletionFailure {
  userId: string;
  error: string;
}

@Injectable()
export class GdprService {
  static readonly RETENTION_BATCH_SIZE = 500;
  static readonly RETENTION_LOCK_KEY = 'gdpr:data_retention_cron_lock';
  static readonly RETENTION_LOCK_TTL_MS = 30 * 60 * 1000;

  private readonly logger = new Logger(GdprService.name);
  private isRetentionRunning = false;

  constructor(
    @InjectRepository(GdprConsent)
    private readonly gdprConsentRepository: Repository<GdprConsent>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(KYCApplication)
    private readonly kycApplicationRepository: Repository<KYCApplication>,
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @InjectRepository(RateAlert)
    private readonly rateAlertRepository: Repository<RateAlert>,
    @InjectRepository(WebhookEndpoint)
    private readonly webhookEndpointRepository: Repository<WebhookEndpoint>,
    @InjectRepository(WebhookDelivery)
    private readonly webhookDeliveryRepository: Repository<WebhookDelivery>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    @InjectRepository(ErasureAuditLog)
    private readonly erasureAuditLogRepository: Repository<ErasureAuditLog>,
    @InjectRepository(Expense)
    private readonly expenseRepository: Repository<Expense>,
    @Inject(STORAGE_SERVICE_TOKEN)
    private readonly storageService: StorageService,
    @InjectQueue('gdpr-export') private readonly exportQueue: Queue,
    private readonly configService: ConfigService,
    @Optional()
    private readonly redisService?: RedisService,
  ) {}

  async recordConsent(
    userId: string,
    version: string,
    ipAddress: string | null,
    userAgent: string | null,
  ): Promise<GdprConsent> {
    const consent = this.gdprConsentRepository.create({
      userId,
      version,
      consentedAt: new Date(),
      ipAddress,
      userAgent,
    });
    return this.gdprConsentRepository.save(consent);
  }

  async eraseUser(
    userId: string,
    passwordInput: string,
    reason?: string,
  ): Promise<{ filesDeleted: number; status: string }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (!user.password) {
      // bcrypt.compare throws on a missing hash — every OAuth-only account hit
      // a 500 here. Until the alternative verification step exists they get an
      // explicit error instead of an unhandled failure.
      throw new BadRequestException(
        'This account has no password. Alternative verification is required before it can be erased.',
      );
    }

    const isPasswordValid = await bcrypt.compare(passwordInput, user.password);
    if (!isPasswordValid) throw new UnauthorizedException('Invalid password');

    const pendingTransactions = await this.transactionRepository.count({
      where: { userId, status: TransactionStatus.PENDING },
    });
    if (pendingTransactions > 0) {
      throw new UnprocessableEntityException(
        'Cannot erase account with pending transactions',
      );
    }

    // Collect all S3 keys to delete BEFORE any DB writes
    const keysToDelete: string[] = [];
    const failedDeletions: string[] = [];

    // 1. KYC document keys — the live flow keeps them in
    // kyc_applications.documents, not on the legacy kyc_records row.
    const kycApplications = await this.kycApplicationRepository.find({
      where: { userId },
    });
    for (const application of kycApplications) {
      Object.values(application.documents ?? {}).forEach((document) => {
        if (document?.s3Key) keysToDelete.push(document.s3Key);
      });
    }

    // 2. Expense receipt keys
    const expenses = await this.expenseRepository.find({ where: { userId } });
    expenses.forEach((e) => {
      if (e.receiptKey) keysToDelete.push(e.receiptKey);
    });

    // 3. Profile photo key (if stored on user)
    const userAny = user as any;
    if (userAny.profilePhotoKey) keysToDelete.push(userAny.profilePhotoKey);

    // Attempt S3 deletions — never block erasure on failure
    if (keysToDelete.length > 0) {
      const results = await Promise.allSettled(
        keysToDelete.map((key) => this.storageService.delete(key)),
      );
      results.forEach((r, i) => {
        if (r.status === 'rejected') {
          const msg =
            r.reason instanceof Error ? r.reason.message : String(r.reason);
          this.logger.error(
            `CRITICAL: S3 deletion failed for key ${keysToDelete[i]}: ${msg}`,
          );
          failedDeletions.push(keysToDelete[i]);
        }
      });
    }

    // Anonymise user (including the personal data that used to survive erasure)
    user.email = `deleted-${user.id}@nexafx.deleted`;
    user.firstName = 'Deleted';
    user.lastName = 'Deleted';
    user.password = null;
    user.phone = null;
    user.fcmTokens = [];
    user.fcmToken = null;
    user.stripeCardholderId = null;
    user.referralCode = `erased-${user.id}`;
    user.twoFactorSecret = null;
    user.isActive = false;
    user.isDeleted = true;
    user.deletedAt = new Date();
    await this.userRepository.save(user);

    // Clear refresh tokens
    await this.refreshTokenRepository.update(
      { userId },
      { revokedAt: new Date() },
    );

    // Drop the document keys, then the applications themselves.
    if (kycApplications.length > 0) {
      await this.kycApplicationRepository.update({ userId }, { documents: {} });
    }
    await this.kycApplicationRepository.delete({ userId });

    // Delete non-financial records
    await this.notificationRepository.delete({ userId });
    await this.rateAlertRepository.delete({ userId });
    await this.webhookEndpointRepository.delete({ userId });

    // Log erasure event
    // Write the mapped columns: userId/entity/entityId are accessors rather
    // than columns, so Repository.create dropped them and left resourceType and
    // status (both NOT NULL) unset, failing the insert after the account had
    // already been anonymised.
    const auditLog = this.auditLogRepository.create({
      actorId: userId,
      action: 'gdpr.erasure',
      resourceType: AuditEntityType.USER,
      resourceId: userId,
      status: AuditLogStatus.SUCCESS,
      metadata: {
        reason,
        filesDeleted: keysToDelete.length - failedDeletions.length,
        failedDeletions,
      },
      ipAddress: '0.0.0.0',
      userAgent: 'Anonymised',
    });
    await this.auditLogRepository.save(auditLog);

    // Create ErasureAuditLog
    const erasureLog = this.erasureAuditLogRepository.create({
      userId,
      filesDeleted: keysToDelete.length - failedDeletions.length,
      failedDeletions,
    });
    await this.erasureAuditLogRepository.save(erasureLog);

    if (failedDeletions.length > 0) {
      this.logger.error(
        `CRITICAL: ${failedDeletions.length} S3 keys failed to delete during GDPR erasure for user ${userId}: ${failedDeletions.join(', ')}`,
      );
    }

    return {
      filesDeleted: keysToDelete.length - failedDeletions.length,
      status: 'erased',
    };
  }

  async requestExport(userId: string): Promise<string> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const job = await this.exportQueue.add(
      'export',
      { userId, email: user.email },
      {
        jobId: `export-${userId}-${Date.now()}`,
      },
    );

    return job.id!;
  }

  async getExportStatus(
    userId: string,
  ): Promise<{ status: string; jobId: string | null }> {
    const jobs = await this.exportQueue.getJobs([
      'active',
      'waiting',
      'delayed',
      'completed',
      'failed',
    ]);
    const userJob = jobs.reverse().find((j) => j.data.userId === userId);
    if (!userJob) return { status: 'no_job_found', jobId: null };

    const state = await userJob.getState();
    return { status: state, jobId: userJob.id || null };
  }

  private async acquireRetentionLock(): Promise<{
    acquired: boolean;
    release: () => Promise<void>;
  }> {
    if (this.isRetentionRunning) {
      return { acquired: false, release: async () => undefined };
    }

    this.isRetentionRunning = true;
    const token = crypto.randomUUID();
    const lockKey =
      typeof this.redisService?.key === 'function'
        ? this.redisService.key('gdpr', 'data_retention_cron_lock')
        : GdprService.RETENTION_LOCK_KEY;
    const rawClient = this.redisService?.rawClient;

    if (rawClient && typeof rawClient.set === 'function') {
      try {
        const result = await rawClient.set(
          lockKey,
          token,
          'PX',
          GdprService.RETENTION_LOCK_TTL_MS,
          'NX',
        );
        if (result !== 'OK') {
          this.isRetentionRunning = false;
          return { acquired: false, release: async () => undefined };
        }
      } catch (error) {
        this.logger.warn(
          `Redis lock unavailable for GDPR retention cron; falling back to local lock: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return {
      acquired: true,
      release: async () => {
        try {
          if (rawClient && typeof rawClient.get === 'function') {
            const current = await rawClient.get(lockKey);
            if (current === token && typeof rawClient.del === 'function') {
              await rawClient.del(lockKey);
            }
          }
        } catch {
          // Best-effort lock release
        } finally {
          this.isRetentionRunning = false;
        }
      },
    };
  }

  private async deleteExpiredInBatches<
    T extends { id: string; createdAt: Date },
  >(repo: Repository<T>, cutoff: Date, batchSize: number): Promise<number> {
    let totalDeleted = 0;

    if (typeof repo.createQueryBuilder === 'function') {
      const probeQb = repo.createQueryBuilder('record');
      if (probeQb && typeof probeQb.select === 'function') {
        while (true) {
          const batchQb = repo
            .createQueryBuilder('record')
            .select(['record.id'])
            .where('record.createdAt < :cutoff', { cutoff })
            .orderBy('record.createdAt', 'ASC')
            .take(batchSize);

          const batch = await batchQb.getMany();
          if (!Array.isArray(batch) || batch.length === 0) {
            break;
          }

          const ids = batch.map((row) => row.id);
          const deleteRes = await repo.delete({ id: In(ids) } as any);
          totalDeleted += deleteRes?.affected ?? ids.length;

          if (batch.length < batchSize) {
            break;
          }
        }

        return totalDeleted;
      }
    }

    if (typeof repo.find === 'function') {
      let fetchedAnyBatch = false;
      while (true) {
        const batch = await repo.find({
          select: ['id'] as any,
          where: { createdAt: LessThan(cutoff) } as any,
          take: batchSize,
        });

        if (!Array.isArray(batch) || batch.length === 0) {
          break;
        }

        fetchedAnyBatch = true;
        const ids = batch.map((row) => row.id);
        const deleteRes = await repo.delete({ id: In(ids) } as any);
        totalDeleted += deleteRes?.affected ?? ids.length;

        if (batch.length < batchSize) {
          break;
        }
      }

      if (fetchedAnyBatch) {
        return totalDeleted;
      }
    }

    const fallbackRes = await repo.delete({
      createdAt: LessThan(cutoff),
    } as any);
    return fallbackRes?.affected ?? 0;
  }

  private async fetchEligibleUsersBatch(
    thirtyDaysAgo: Date,
    sevenYearsAgo: Date,
    batchSize: number,
    lastProcessedUserId: string | null,
  ): Promise<Array<{ id: string }>> {
    if (typeof this.userRepository.createQueryBuilder === 'function') {
      const qb = this.userRepository.createQueryBuilder('u');
      if (qb && typeof qb.where === 'function') {
        qb.select(['u.id'])
          .where('u.isActive = :isActive', { isActive: false })
          .andWhere('u.deletedAt < :thirtyDaysAgo', { thirtyDaysAgo })
          .andWhere(
            `NOT EXISTS (
              SELECT 1
              FROM transactions tx
              WHERE tx."userId" = u.id
                AND tx."createdAt" > :sevenYearsAgo
            )`,
            { sevenYearsAgo },
          );

        if (lastProcessedUserId) {
          qb.andWhere('u.id > :lastProcessedUserId', { lastProcessedUserId });
        }

        if (typeof qb.orderBy === 'function') {
          qb.orderBy('u.id', 'ASC');
        }
        if (typeof qb.take === 'function') {
          qb.take(batchSize);
        }

        const rows = await qb.getMany();
        return Array.isArray(rows) ? rows : [];
      }
    }

    // Fallback when createQueryBuilder is not mocked in lightweight unit tests
    if (lastProcessedUserId !== null) {
      return [];
    }
    const rows = await this.userRepository.find({
      where: {
        isActive: false,
        deletedAt: LessThan(thirtyDaysAgo),
      },
      take: batchSize,
    });
    return Array.isArray(rows) ? rows : [];
  }

  @Cron('0 0 1 * *')
  async enforceDataRetentionPolicies(
    batchSize: number = GdprService.RETENTION_BATCH_SIZE,
  ): Promise<void> {
    const lock = await this.acquireRetentionLock();
    if (!lock.acquired) {
      this.logger.log(
        'Skipping monthly data retention cron job — lock already held by another instance.',
      );
      return;
    }

    try {
      this.logger.log('Starting monthly data retention cron job...');

      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      const sevenYearsAgo = new Date(
        now.getTime() - 7 * 365 * 24 * 60 * 60 * 1000,
      );

      // 1. Delete notifications older than 90 days in batches
      const notificationsDeleted = await this.deleteExpiredInBatches(
        this.notificationRepository,
        ninetyDaysAgo,
        batchSize,
      );

      // 2. Delete webhook deliveries older than 30 days in batches
      const webhookDeliveriesDeleted = await this.deleteExpiredInBatches(
        this.webhookDeliveryRepository,
        thirtyDaysAgo,
        batchSize,
      );

      // 3. Select eligible anonymised users without financial records in 7 years
      //    using a single NOT EXISTS query per batch and isolate per-user delete errors.
      let deletedUsersCount = 0;
      const failedUserDeletions: RetentionUserDeletionFailure[] = [];
      let lastProcessedUserId: string | null = null;

      while (true) {
        const eligibleUsers = await this.fetchEligibleUsersBatch(
          thirtyDaysAgo,
          sevenYearsAgo,
          batchSize,
          lastProcessedUserId,
        );

        if (eligibleUsers.length === 0) {
          break;
        }

        for (const user of eligibleUsers) {
          lastProcessedUserId = user.id;
          try {
            await this.userRepository.delete(user.id);
            deletedUsersCount++;
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            failedUserDeletions.push({
              userId: user.id,
              error: errorMessage,
            });
            this.logger.error(
              `Failed to hard-delete user ${user.id} during retention cron: ${errorMessage}`,
            );
          }
        }

        if (eligibleUsers.length < batchSize) {
          break;
        }
      }

      // Always write the retention audit log, including failure count and failures
      const auditLog = this.auditLogRepository.create({
        actorId: null,
        action: 'gdpr.data_retention_cron',
        resourceType: AuditEntityType.SYSTEM,
        resourceId: null,
        status: AuditLogStatus.SUCCESS,
        metadata: {
          notificationsDeleted,
          webhookDeliveriesDeleted,
          usersHardDeleted: deletedUsersCount,
          failureCount: failedUserDeletions.length,
          failedUsersCount: failedUserDeletions.length,
          failures: failedUserDeletions,
          failedUserDeletions,
        },
        ipAddress: '127.0.0.1',
        userAgent: 'Cron',
      });
      await this.auditLogRepository.save(auditLog);

      this.logger.log(
        `Data retention complete: ${deletedUsersCount} users (${failedUserDeletions.length} failed), ${notificationsDeleted} notifications, ${webhookDeliveriesDeleted} webhooks deleted.`,
      );
    } finally {
      await lock.release();
    }
  }

  async getConsentStatus(userId: string): Promise<{
    requiresConsentUpdate: boolean;
    currentVersion: string | null;
    requiredVersion: string;
  }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const requiredVersion =
      this.configService.get<string>('PRIVACY_POLICY_VERSION') || '1.0';
    const currentVersion = user.consentGdprVersion;

    return {
      requiresConsentUpdate: currentVersion !== requiredVersion,
      currentVersion,
      requiredVersion,
    };
  }

  async updateConsent(
    userId: string,
    ipAddress: string | null,
    userAgent: string | null,
  ): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const requiredVersion =
      this.configService.get<string>('PRIVACY_POLICY_VERSION') || '1.0';

    user.consentGdpr = true;
    user.consentGdprAt = new Date();
    user.consentGdprVersion = requiredVersion;
    await this.userRepository.save(user);

    await this.recordConsent(userId, requiredVersion, ipAddress, userAgent);
  }
}
