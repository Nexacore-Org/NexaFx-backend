import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { UsersService } from './users.service';
import { RefreshTokensService } from '../../tokens/refresh-tokens.service';
import { User } from '../entities/user.entity';
import { DataRequest } from '../entities/data-request.entity';
import {
  DataRequestType,
  DataRequestStatus,
} from '../entities/data-request.entity';
import { Transaction } from '../../transactions/entities/transaction.entity';
import { Notification } from '../../notifications/entities/notification.entity';
import { KycRecord } from '../../kyc/entities/kyc.entity';
import { Beneficiary } from '../../beneficiaries/entities/beneficiary.entity';
import { AuditLog } from '../../audit-logs/entities/audit-log.entity';
import { NotificationType } from '../../notifications/entities/notification.entity';
import { NotificationsService } from '../../notifications/notifications.service';

@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);
  private readonly HARD_DELETE_DAYS = 30;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(DataRequest)
    private readonly dataRequestRepository: Repository<DataRequest>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @InjectRepository(KycRecord)
    private readonly kycRepository: Repository<KycRecord>,
    @InjectRepository(Beneficiary)
    private readonly beneficiaryRepository: Repository<Beneficiary>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
    private readonly usersService: UsersService,
    private readonly refreshTokensService: RefreshTokensService,
    private readonly notificationsService: NotificationsService,
    private readonly dataSource: DataSource,
  ) {}

  async requestAccountDeletion(userId: string): Promise<DataRequest> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check for existing deletion request
    const existingRequest = await this.dataRequestRepository.findOne({
      where: {
        userId,
        type: DataRequestType.DELETION,
        status: In([DataRequestStatus.PENDING, DataRequestStatus.PROCESSING]),
      },
    });

    if (existingRequest) {
      throw new Error('An account deletion request is already in progress.');
    }

    const dataRequest = this.dataRequestRepository.create({
      userId,
      type: DataRequestType.DELETION,
      status: DataRequestStatus.PENDING,
      requestedAt: new Date(),
      completedAt: null,
      downloadUrl: null,
      expiresAt: null,
    });

    const saved = await this.dataRequestRepository.save(dataRequest);
    this.logger.log(
      `Account deletion requested for user ${userId}, request ID: ${saved.id}`,
    );

    // Start async processing
    this.processAccountDeletion(saved.id).catch((err) => {
      this.logger.error(
        `Failed to process account deletion for request ${saved.id}:`,
        err,
      );
    });

    return saved;
  }

  async processAccountDeletion(requestId: string): Promise<void> {
    const request = await this.dataRequestRepository.findOne({
      where: { id: requestId },
    });

    if (!request) {
      this.logger.error(`Account deletion request ${requestId} not found`);
      return;
    }

    const userId = request.userId;

    try {
      request.status = DataRequestStatus.PROCESSING;
      await this.dataRequestRepository.save(request);

      this.logger.log(
        `Processing account deletion for user ${userId}, request ${requestId}`,
      );

      await this.anonymizeUserAccount(userId);

      request.status = DataRequestStatus.COMPLETE;
      request.completedAt = new Date();
      await this.dataRequestRepository.save(request);

      // Schedule hard delete in 30 days
      const hardDeleteAt = new Date();
      hardDeleteAt.setDate(hardDeleteAt.getDate() + this.HARD_DELETE_DAYS);

      this.logger.log(
        `Account deletion completed for user ${userId}. Hard delete scheduled for ${hardDeleteAt.toISOString()}`,
      );

      // Send notification
      await this.notificationsService.create({
        userId,
        type: NotificationType.SYSTEM,
        title: 'Account Deletion Processed',
        message: `Your account has been anonymized. Your data will be permanently deleted in ${this.HARD_DELETE_DAYS} days.`,
        metadata: { hardDeleteAt: hardDeleteAt.toISOString(), requestId },
      });
    } catch (error) {
      request.status = DataRequestStatus.FAILED;
      request.completedAt = new Date();
      await this.dataRequestRepository.save(request);

      this.logger.error(
        `Account deletion failed for user ${userId}, request ${requestId}:`,
        error,
      );

      try {
        await this.notificationsService.create({
          userId,
          type: NotificationType.SYSTEM,
          title: 'Account Deletion Failed',
          message:
            'Your account deletion request failed. Please try again later.',
          metadata: { requestId, error: error.message },
        });
      } catch (notifyError) {
        this.logger.error('Failed to send failure notification:', notifyError);
      }
    }
  }

  async anonymizeUserAccount(userId: string): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const user = await queryRunner.manager.findOne(User, {
        where: { id: userId },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Anonymize PII fields
      const suffix = `DELETED_${userId}`;

      user.email = `deleted_${suffix}@nexafx.invalid`;
      user.firstName = 'DELETED';
      user.lastName = suffix;
      user.phone = null;
      user.walletPublicKey = `deleted_${suffix}`;
      user.walletSecretKeyEncrypted = `encrypted_deleted_${suffix}`;
      user.twoFactorSecret = null;
      user.isVerified = false;
      user.isTwoFactorEnabled = false;
      user.fcmTokens = [];
      user.balances = {};
      user.isSuspended = false;
      user.isDeleted = true;

      await queryRunner.manager.save(user);

      // Revoke all refresh tokens
      await queryRunner.manager.update(
        'refresh_token',
        { userId },
        { revokedAt: new Date() },
      );

      // Anonymize KYC records
      await queryRunner.manager.update(
        KycRecord,
        { userId },
        {
          fullName: 'DELETED',
          documentNumber: 'DELETED',
          documentFrontUrl: null,
          documentBackUrl: null,
          selfieUrl: null,
          rejectionReason: 'Account deleted',
          status: 'rejected',
        },
      );

      // Note: Transactions are retained for compliance (only PII anonymized above)

      // Anonymize beneficiaries
      await queryRunner.manager.update(
        Beneficiary,
        { userId },
        {
          nickname: 'DELETED',
          walletAddress: 'deleted',
        },
      );

      // Note: Audit logs are retained for compliance
      // Only clear IP/userAgent in audit logs if they contain PII

      // Clear notifications content
      await queryRunner.manager.update(
        Notification,
        { userId },
        {
          title: 'Account Deleted',
          message: 'This account has been anonymized',
          metadata: null,
          actionUrl: null,
        },
      );

      await queryRunner.commitTransaction();
      this.logger.log(`User account anonymized: ${userId}`);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async performHardDelete(): Promise<{ deleted: number; processed: number }> {
    this.logger.log(
      '[Hard Delete] Starting hard delete process for accounts older than 30 days',
    );

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.HARD_DELETE_DAYS);

    // Find deletion requests that are COMPLETE and older than 30 days
    const deletionRequests = await this.dataRequestRepository
      .createQueryBuilder('dr')
      .where('dr.type = :type', { type: DataRequestType.DELETION })
      .andWhere('dr.status = :status', { status: DataRequestStatus.COMPLETE })
      .andWhere('dr.completedAt < :cutoff', { cutoff: cutoffDate })
      .getMany();

    if (deletionRequests.length === 0) {
      this.logger.log('[Hard Delete] No accounts ready for hard delete');
      return { deleted: 0, processed: 0 };
    }

    this.logger.log(
      `[Hard Delete] Found ${deletionRequests.length} accounts ready for hard delete`,
    );

    const userIds = deletionRequests.map((req) => req.userId);
    let deletedCount = 0;

    for (const userId of userIds) {
      try {
        await this.hardDeleteUser(userId);
        deletedCount++;
        this.logger.log(`[Hard Delete] Permanently deleted user: ${userId}`);
      } catch (error) {
        this.logger.error(
          `[Hard Delete] Failed to delete user ${userId}:`,
          error,
        );
      }
    }

    this.logger.log(
      `[Hard Delete] Completed: ${deletedCount}/${deletionRequests.length} accounts deleted`,
    );
    return { deleted: deletedCount, processed: deletionRequests.length };
  }

  private async hardDeleteUser(userId: string): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Get user
      const user = await queryRunner.manager.findOne(User as any, {
        where: { id: userId },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Anonymize PII fields on user record
      const suffix = `DELETED_${userId}`;
      user.email = `deleted_${suffix}@nexafx.invalid`;
      (user as any).firstName = 'DELETED';
      (user as any).lastName = suffix;
      (user as any).phone = null;
      (user as any).walletPublicKey = `deleted_${suffix}`;
      (user as any).walletSecretKeyEncrypted = `encrypted_deleted_${suffix}`;
      (user as any).twoFactorSecret = null;
      (user as any).isVerified = false;
      (user as any).isTwoFactorEnabled = false;
      (user as any).fcmTokens = [];
      (user as any).balances = {};
      (user as any).isSuspended = false;
      user.isDeleted = true;

      await queryRunner.manager.save(User as any, user);

      // Revoke all refresh tokens
      await queryRunner.manager.update(
        'refresh_token',
        { userId },
        { revokedAt: new Date() },
      );

      // Anonymize KYC records
      await queryRunner.manager.update(
        KycRecord as any,
        { userId },
        {
          fullName: 'DELETED',
          documentNumber: 'DELETED',
          documentFrontUrl: null,
          documentBackUrl: null,
          selfieUrl: null,
          rejectionReason: 'Account deleted',
          status: 'rejected' as any,
        },
      );

      // Anonymize beneficiaries
      await queryRunner.manager.update(
        Beneficiary as any,
        { userId },
        {
          nickname: 'DELETED',
          walletAddress: 'deleted',
        },
      );

      // Delete notifications
      await queryRunner.manager.delete(Notification as any, { userId });

      // Delete audit logs
      await queryRunner.manager.delete(AuditLog as any, { userId });

      // Delete price alerts
      await queryRunner.manager.delete('rate_alerts', { userId });
      await queryRunner.manager.delete('rate_alert_price_history', { userId });

      // Delete referral records where user is referee
      await queryRunner.manager.delete('referrals', { refereeId: userId });

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
  }

  async getDeletionStatus(userId: string): Promise<DataRequest | null> {
    return this.dataRequestRepository.findOne({
      where: { userId, type: DataRequestType.DELETION },
      order: { requestedAt: 'DESC' },
    });
  }
}
