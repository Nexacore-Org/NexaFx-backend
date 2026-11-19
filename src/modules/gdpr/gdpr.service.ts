import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
  UnprocessableEntityException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ObjectLiteral } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
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
import { Inject } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../modules/redis/redis.service';

const RETENTION_BATCH_SIZE = 500;
const RETENTION_LOCK_TTL_MS = 6 * 60 * 60 * 1000;
const RELEASE_LOCK_SCRIPT =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

@Injectable()
export class GdprService {
  private readonly logger = new Logger(GdprService.name);

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
    private readonly redisService: RedisService,
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
      await this.kycApplicationRepository.update(
        { userId },
        { documents: {} },
      );
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

  @Cron('0 0 1 * *')
  async enforceDataRetentionPolicies(): Promise<void> {
    if (!(await this.redisService.isReady())) {
      this.logger.error(
        'Skipping monthly data retention cron because Redis is unavailable',
      );
      return;
    }

    const lockKey = this.redisService.key('gdpr', 'data-retention');
    const lockToken = randomUUID();
    const lock = await this.redisService.rawClient.set(
      lockKey,
      lockToken,
      'PX',
      RETENTION_LOCK_TTL_MS,
      'NX',
    );
    if (lock !== 'OK') {
      this.logger.log(
        'Data retention cron is already running on another replica',
      );
      return;
    }

    try {
      await this.runDataRetentionPolicies();
    } finally {
      await this.redisService.rawClient.eval(
        RELEASE_LOCK_SCRIPT,
        1,
        lockKey,
        lockToken,
      );
    }
  }

  private async runDataRetentionPolicies(): Promise<void> {
    this.logger.log('Starting monthly data retention cron job...');

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const sevenYearsAgo = new Date(
      now.getTime() - 7 * 365 * 24 * 60 * 60 * 1000,
    );

    const failures: Array<{
      operation: string;
      userId?: string;
      error: string;
    }> = [];
    let notificationsDeleted = 0;
    let webhookDeliveriesDeleted = 0;
    let deletedUsersCount = 0;

    try {
      notificationsDeleted = await this.deleteExpiredInBatches(
        this.notificationRepository,
        ninetyDaysAgo,
      );
    } catch (error) {
      failures.push({
        operation: 'delete_expired_notifications',
        error: this.errorMessage(error),
      });
      this.logger.error('Failed to delete expired notifications', error);
    }

    try {
      webhookDeliveriesDeleted = await this.deleteExpiredInBatches(
        this.webhookDeliveryRepository,
        thirtyDaysAgo,
      );
    } catch (error) {
      failures.push({
        operation: 'delete_expired_webhook_deliveries',
        error: this.errorMessage(error),
      });
      this.logger.error('Failed to delete expired webhook deliveries', error);
    }

    let lastUserId: string | undefined;
    try {
      while (true) {
        const eligibleUsersQuery = this.userRepository
          .createQueryBuilder('user')
          .select(['user.id'])
          .where('user.isActive = :isActive', { isActive: false })
          .andWhere('user.deletedAt < :thirtyDaysAgo', { thirtyDaysAgo })
          .andWhere((queryBuilder) => {
            const recentTransaction = queryBuilder
              .subQuery()
              .select('1')
              .from(Transaction, 'tx')
              .where('tx.userId = user.id')
              .andWhere('tx.createdAt > :sevenYearsAgo')
              .getQuery();
            return `NOT EXISTS ${recentTransaction}`;
          })
          .setParameter('sevenYearsAgo', sevenYearsAgo);

        if (lastUserId) {
          eligibleUsersQuery.andWhere('user.id > :lastUserId', { lastUserId });
        }

        const users = await eligibleUsersQuery
          .orderBy('user.id', 'ASC')
          .take(RETENTION_BATCH_SIZE)
          .getMany();
        if (users.length === 0) break;

        for (const user of users) {
          lastUserId = user.id;
          try {
            const result = await this.userRepository.delete(user.id);
            deletedUsersCount += result.affected ?? 0;
          } catch (error) {
            failures.push({
              operation: 'hard_delete_user',
              userId: user.id,
              error: this.errorMessage(error),
            });
            this.logger.error(
              `Failed to hard-delete retained user ${user.id}`,
              error,
            );
          }
        }
      }
    } catch (error) {
      failures.push({
        operation: 'find_eligible_users',
        error: this.errorMessage(error),
      });
      this.logger.error(
        'Failed to find users eligible for retention deletion',
        error,
      );
    }

    const auditLog = this.auditLogRepository.create({
      actorId: null,
      action: 'gdpr.data_retention_cron',
      resourceType: AuditEntityType.SYSTEM,
      resourceId: null,
      status:
        failures.length > 0 ? AuditLogStatus.FAILURE : AuditLogStatus.SUCCESS,
      metadata: {
        notificationsDeleted,
        webhookDeliveriesDeleted,
        usersHardDeleted: deletedUsersCount,
        usersHardDeleteFailures: failures.filter(
          (failure) => failure.operation === 'hard_delete_user',
        ),
        failures,
      },
      ipAddress: '127.0.0.1',
      userAgent: 'Cron',
    });
    await this.auditLogRepository.save(auditLog);

    this.logger.log(
      `Data retention complete: ${deletedUsersCount} users, ${notificationsDeleted} notifications, ${webhookDeliveriesDeleted} webhooks deleted; ${failures.length} failures.`,
    );
  }

  private async deleteExpiredInBatches<T extends ObjectLiteral>(
    repository: Repository<T>,
    cutoff: Date,
  ): Promise<number> {
    let deletedCount = 0;
    let lastId: string | undefined;

    while (true) {
      const expiredRecordsQuery = repository
        .createQueryBuilder('record')
        .select('record.id', 'id')
        .where('record.createdAt < :cutoff', { cutoff });
      if (lastId) {
        expiredRecordsQuery.andWhere('record.id > :lastId', { lastId });
      }

      const records = await expiredRecordsQuery
        .orderBy('record.id', 'ASC')
        .take(RETENTION_BATCH_SIZE)
        .getRawMany<{ id: string }>();
      if (records.length === 0) break;

      const result = await repository.delete(
        records.map((record) => record.id),
      );
      deletedCount += result.affected ?? 0;
      lastId = records[records.length - 1].id;
    }

    return deletedCount;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
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
