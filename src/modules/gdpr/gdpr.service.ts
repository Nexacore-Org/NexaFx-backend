import { Injectable, UnauthorizedException, UnprocessableEntityException, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, In } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as bcrypt from 'bcrypt';
import { GdprConsent } from './entities/gdpr-consent.entity';
import { User } from '../../users/user.entity';
import { Transaction, TransactionStatus } from '../../transactions/entities/transaction.entity';
import { KycRecord } from '../../kyc/entities/kyc.entity';
import { Notification } from '../../notifications/entities/notification.entity';
import { RateAlert } from '../../rate-alerts/entities/rate-alert.entity';
import { WebhookEndpoint } from '../../webhooks/entities/webhook-endpoint.entity';
import { WebhookDelivery } from '../../webhooks/entities/webhook-delivery.entity';
import { AuditLog } from '../../audit-logs/entities/audit-log.entity';
import { AuditEntityType } from '../../audit-logs/enums/audit-entity-type.enum';
import { RefreshToken } from '../../tokens/refresh-token.entity';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';

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
    @InjectRepository(KycRecord)
    private readonly kycRepository: Repository<KycRecord>,
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
    @InjectQueue('gdpr-export') private readonly exportQueue: Queue,
    private readonly configService: ConfigService,
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

  async eraseUser(userId: string, passwordInput: string, reason?: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const isPasswordValid = await bcrypt.compare(passwordInput, user.password);
    if (!isPasswordValid) throw new UnauthorizedException('Invalid password');

    // Check for pending transactions
    const pendingTransactions = await this.transactionRepository.count({
      where: { userId, status: TransactionStatus.PENDING },
    });
    if (pendingTransactions > 0) {
      throw new UnprocessableEntityException('Cannot erase account with pending transactions');
    }

    // Anonymise user
    const deletedEmail = `deleted-${user.id}@nexafx.deleted`;
    user.email = deletedEmail;
    user.firstName = 'Deleted';
    user.lastName = 'Deleted';
    user.password = ''; // Cleared since we no longer need login
    user.twoFactorSecret = null;
    user.isActive = false;
    user.deletedAt = new Date();
    await this.userRepository.save(user);

    // Clear refresh tokens
    await this.refreshTokenRepository.update({ userId }, { revokedAt: new Date() });

    // Delete non-financial records
    await this.kycRepository.delete({ userId });
    await this.notificationRepository.delete({ userId });
    await this.rateAlertRepository.delete({ userId });
    await this.webhookEndpointRepository.delete({ userId });

    // Log erasure event
    const auditLog = this.auditLogRepository.create({
      userId,
      action: 'gdpr.erasure',
      entity: AuditEntityType.USER,
      entityId: userId,
      metadata: { reason },
      ipAddress: '0.0.0.0', // Not passed down for erasure in the issue spec, anonymised
      userAgent: 'Anonymised',
    });
    await this.auditLogRepository.save(auditLog);
  }

  async requestExport(userId: string): Promise<string> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const job = await this.exportQueue.add('export', { userId, email: user.email }, {
      jobId: `export-${userId}-${Date.now()}`
    });

    return job.id!;
  }

  async getExportStatus(userId: string): Promise<{ status: string, jobId: string | null }> {
    const jobs = await this.exportQueue.getJobs(['active', 'waiting', 'delayed', 'completed', 'failed']);
    const userJob = jobs.reverse().find(j => j.data.userId === userId);
    if (!userJob) return { status: 'no_job_found', jobId: null };

    const state = await userJob.getState();
    return { status: state, jobId: userJob.id || null };
  }

  @Cron('0 0 1 * *')
  async enforceDataRetentionPolicies(): Promise<void> {
    this.logger.log('Starting monthly data retention cron job...');

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const sevenYearsAgo = new Date(now.getTime() - 7 * 365 * 24 * 60 * 60 * 1000);

    // 1. Delete notifications older than 90 days
    const notificationsResult = await this.notificationRepository.delete({
      createdAt: LessThan(ninetyDaysAgo),
    });

    // 2. Delete webhook deliveries older than 30 days
    const webhooksResult = await this.webhookDeliveryRepository.delete({
      createdAt: LessThan(thirtyDaysAgo),
    });

    // 3. Delete anonymised users without financial records in 7 years
    const anonymisedUsers = await this.userRepository.find({
      where: {
        isActive: false,
        deletedAt: LessThan(thirtyDaysAgo),
      },
    });

    let deletedUsersCount = 0;
    for (const user of anonymisedUsers) {
      const recentTransactions = await this.transactionRepository.count({
        where: {
          userId: user.id,
          createdAt: LessThan(now), // Wait, needs to be greater than 7 years ago
        },
      });
      // We actually want to check if there are ANY transactions created AFTER 7 years ago
      const hasRecentFinancials = await this.transactionRepository.createQueryBuilder('tx')
        .where('tx.userId = :userId', { userId: user.id })
        .andWhere('tx.createdAt > :sevenYearsAgo', { sevenYearsAgo })
        .getCount();

      if (hasRecentFinancials === 0) {
        await this.userRepository.delete(user.id);
        deletedUsersCount++;
      }
    }

    // Log the results
    const auditLog = this.auditLogRepository.create({
      userId: null as any,
      action: 'gdpr.data_retention_cron',
      entity: AuditEntityType.SYSTEM,
      entityId: 'data-retention',
      metadata: {
        notificationsDeleted: notificationsResult.affected || 0,
        webhookDeliveriesDeleted: webhooksResult.affected || 0,
        usersHardDeleted: deletedUsersCount,
      },
      ipAddress: '127.0.0.1',
      userAgent: 'Cron',
    });
    await this.auditLogRepository.save(auditLog);

    this.logger.log(`Data retention complete: ${deletedUsersCount} users, ${notificationsResult.affected} notifications, ${webhooksResult.affected} webhooks deleted.`);
  }

  async getConsentStatus(userId: string): Promise<{ requiresConsentUpdate: boolean, currentVersion: string | null, requiredVersion: string }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const requiredVersion = this.configService.get<string>('PRIVACY_POLICY_VERSION') || '1.0';
    const currentVersion = user.consentGdprVersion;

    return {
      requiresConsentUpdate: currentVersion !== requiredVersion,
      currentVersion,
      requiredVersion,
    };
  }

  async updateConsent(userId: string, ipAddress: string | null, userAgent: string | null): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const requiredVersion = this.configService.get<string>('PRIVACY_POLICY_VERSION') || '1.0';

    user.consentGdpr = true;
    user.consentGdprAt = new Date();
    user.consentGdprVersion = requiredVersion;
    await this.userRepository.save(user);

    await this.recordConsent(userId, requiredVersion, ipAddress, userAgent);
  }
}
