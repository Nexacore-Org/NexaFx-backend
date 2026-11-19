import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { UsersService } from '../users.service';
import { RefreshToken } from '../../tokens/refresh-token.entity';
import { BackupCode } from '../../two-factor/entities/backup-code.entity';
import { OAuthAccount } from '../../auth/entities/oauth-account.entity';
import { User } from '../user.entity';
import { DataRequest } from '../entities/data-request.entity';
import {
  DataRequestType,
  DataRequestStatus,
} from '../entities/data-request.entity';
import { Transaction } from '../../transactions/entities/transaction.entity';
import { Notification } from '../../notifications/entities/notification.entity';
import { KycRecord } from '../../kyc/entities/kyc.entity';
import { Wallet } from '../../wallets/entities/wallet.entity';
import { Beneficiary } from '../../beneficiaries/entities/beneficiary.entity';
import { AuditLog } from '../../audit-logs/entities/audit-log.entity';
import { NotificationType } from '../../notifications/entities/notification.entity';
import { NotificationsService } from '../../notifications/notifications.service';

@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);
  private readonly HARD_DELETE_DAYS = 30;
  private readonly AUDIT_LOG_RETENTION_DAYS = 365;

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
    private readonly notificationsService: NotificationsService,
    private readonly dataSource: DataSource,
  ) {}

  async requestAccountDeletion(userId: string): Promise<DataRequest> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const existingRequest = await this.dataRequestRepository.findOne({
      where: {
        userId,
        type: DataRequestType.DELETION,
        status: In([DataRequestStatus.PENDING, DataRequestStatus.PROCESSING]),
      },
    });

    if (existingRequest) {
      throw new ConflictException(
        'An account deletion request is already in progress.',
      );
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

      await this.anonymizeUserAccount(userId);

      request.status = DataRequestStatus.COMPLETE;
      request.completedAt = new Date();
      await this.dataRequestRepository.save(request);

      const hardDeleteAt = new Date();
      hardDeleteAt.setDate(hardDeleteAt.getDate() + this.HARD_DELETE_DAYS);

      await this.notificationsService.create({
        userId,
        type: NotificationType.SECURITY_ALERT,
        title: 'Account Deletion Processed',
        message: `Your account has been anonymized. Your data will be permanently deleted in ${this.HARD_DELETE_DAYS} days.`,
        metadata: { hardDeleteAt: hardDeleteAt.toISOString(), requestId },
      });
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      request.status = DataRequestStatus.FAILED;
      request.completedAt = new Date();
      await this.dataRequestRepository.save(request);

      this.logger.error(
        `Account deletion failed for user ${userId}, request ${requestId}:`,
        err,
      );

      try {
        await this.notificationsService.create({
          userId,
          type: NotificationType.SECURITY_ALERT,
          title: 'Account Deletion Failed',
          message:
            'Your account deletion request failed. Please try again later.',
          metadata: { requestId, error: err.message },
        });
      } catch (notifyError: unknown) {
        const notifyErr =
          notifyError instanceof Error
            ? notifyError
            : new Error(String(notifyError));
        this.logger.error('Failed to send failure notification:', notifyErr);
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
      if ('deletedAt' in user) {
        (user as any).deletedAt = new Date();
      }

      await queryRunner.manager.save(User, user);

      await queryRunner.manager.update(
        RefreshToken,
        { userId },
        { revokedAt: new Date() },
      );

      await queryRunner.manager.delete(BackupCode, { userId });
      await queryRunner.manager.delete(OAuthAccount, { userId });

      await queryRunner.manager.update(
        KycRecord,
        { userId },
        {
          fullName: 'DELETED',
          documentNumber: 'DELETED',
          documentFrontKey: 'deleted',
          documentBackKey: 'deleted',
          selfieKey: 'deleted',
          rejectionReason: 'Account deleted',
          status: 'rejected' as any,
        },
      );

      await queryRunner.manager.update(
        Beneficiary,
        { userId },
        {
          nickname: 'DELETED',
          walletAddress: 'deleted',
        },
      );

      await queryRunner.manager.update(
        Wallet,
        { userId },
        { encryptedSecretKey: 'deleted' },
      );

      await queryRunner.manager.update(
        Notification,
        { userId },
        {
          title: 'Account Deleted',
          body: 'This account has been anonymized',
          data: {},
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

    const deletionRequests = await this.dataRequestRepository
      .createQueryBuilder('dr')
      .where('dr.type = :type', { type: DataRequestType.DELETION })
      .andWhere('dr.status = :status', { status: DataRequestStatus.COMPLETE })
      .andWhere('dr.completedAt < :cutoff', { cutoff: cutoffDate })
      .andWhere('dr.hardDeletedAt IS NULL')
      .getMany();

    if (deletionRequests.length === 0) {
      this.logger.log('[Hard Delete] No accounts ready for hard delete');
      return { deleted: 0, processed: 0 };
    }

    let deletedCount = 0;

    for (const request of deletionRequests) {
      try {
        await this.hardDeleteUser(request.userId);
        request.hardDeletedAt = new Date();
        await this.dataRequestRepository.save(request);
        deletedCount++;
        this.logger.log(
          `[Hard Delete] Permanently deleted user: ${request.userId}`,
        );
      } catch (error) {
        this.logger.error(
          `[Hard Delete] Failed to delete user ${request.userId}:`,
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
      const user = await queryRunner.manager.findOne(User, {
        where: { id: userId },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

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
      if ('deletedAt' in user) {
        (user as any).deletedAt = new Date();
      }

      await queryRunner.manager.save(User, user);

      await queryRunner.manager.update(
        RefreshToken,
        { userId },
        { revokedAt: new Date() },
      );

      await queryRunner.manager.delete(BackupCode, { userId });
      await queryRunner.manager.delete(OAuthAccount, { userId });

      await queryRunner.manager.update(
        KycRecord,
        { userId },
        {
          fullName: 'DELETED',
          documentNumber: 'DELETED',
          documentFrontKey: 'deleted',
          documentBackKey: 'deleted',
          selfieKey: 'deleted',
          rejectionReason: 'Account deleted',
          status: 'rejected' as any,
        },
      );

      await queryRunner.manager.update(
        Beneficiary,
        { userId },
        {
          nickname: 'DELETED',
          walletAddress: 'deleted',
        },
      );

      await queryRunner.manager.update(
        Wallet,
        { userId },
        { encryptedSecretKey: 'deleted' },
      );

      await queryRunner.manager.delete(Notification, { userId });

      const auditRetentionCutoff = new Date();
      auditRetentionCutoff.setDate(
        auditRetentionCutoff.getDate() - this.AUDIT_LOG_RETENTION_DAYS,
      );
      await queryRunner.manager
        .createQueryBuilder()
        .delete()
        .from(AuditLog)
        .where('actorId = :userId', { userId })
        .andWhere('createdAt < :cutoff', { cutoff: auditRetentionCutoff })
        .execute();

      // Pseudonymize retained audit logs (if retained for compliance window)
      await queryRunner.manager.update(
        AuditLog,
        { actorId: userId },
        { actorId: null, ipAddress: null, userAgent: null } as any,
      );

      await queryRunner.manager.delete('rate_alerts', { userId });
      await queryRunner.manager.delete('referrals', { refereeId: userId });

      await queryRunner.manager.delete(User, { id: userId });

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async getDeletionStatus(userId: string): Promise<DataRequest | null> {
    return this.dataRequestRepository.findOne({
      where: { userId, type: DataRequestType.DELETION },
      order: { requestedAt: 'DESC' },
    });
  }
}
