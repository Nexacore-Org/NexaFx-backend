import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Inject,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { KycRecord, KycStatus, KycTier } from './entities/kyc.entity';
import { ApproveKycDto } from './dtos/kyc-approve';
import { User } from '../users/user.entity';
import { SubmitKycDto } from './dtos/kyc-submit';
import { ResubmitKycDto } from './dtos/kyc-resubmit';
import { ConfigService } from '@nestjs/config';
import {
  Notification,
  NotificationType,
  NotificationStatus,
} from '../notifications/entities/notification.entity';
import { FirebaseService } from '../firebase/firebase.service';
import { WebhookService } from '../webhooks/services/webhook.service';
import {
  STORAGE_SERVICE_TOKEN,
  StorageService,
} from '../modules/storage/storage.service';
import { scanBuffer } from '../common/helpers/virus-scanner.helper';
import { SanctionsService } from '../sanctions/sanctions.service';

const SIGNED_URL_EXPIRY_SECONDS = 900;

@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);

  constructor(
    @InjectRepository(KycRecord)
    private kycRepository: Repository<KycRecord>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private configService: ConfigService,
    private readonly dataSource: DataSource,
    private readonly firebaseService: FirebaseService,
    private readonly webhookService: WebhookService,
    @Inject(STORAGE_SERVICE_TOKEN)
    private readonly storageService: StorageService,
    @Optional()
    private readonly sanctionsService?: SanctionsService,
  ) { }

  async submitKyc(
    userId: string,
    dto: SubmitKycDto,
    files: {
      documentFront?: Express.Multer.File;
      documentBack?: Express.Multer.File;
      selfie?: Express.Multer.File;
    },
  ) {
    // Check for active submission
    const existingActiveKyc = await this.kycRepository.findOne({
      where: [
        { userId, status: KycStatus.PENDING },
        { userId, status: KycStatus.UNDER_REVIEW },
      ],
    });

    if (existingActiveKyc) {
      if (existingActiveKyc.status === KycStatus.PENDING) {
        throw new BadRequestException(
          'You already have a KYC submission under review.',
        );
      }
      throw new BadRequestException(
        'Your KYC requires resubmission. Please use the /kyc/resubmit endpoint.',
      );
    }

    if (!files.documentFront) {
      throw new BadRequestException('documentFront file is required');
    }

    if (!files.selfie) {
      throw new BadRequestException('selfie file is required');
    }

    const storagePath = `kyc/${userId}`;

    // Virus scan all files before uploading
    await scanBuffer(files.documentFront.buffer);
    if (files.documentBack) {
      await scanBuffer(files.documentBack.buffer);
    }
    await scanBuffer(files.selfie.buffer);

    // Upload to storage backend — returns storage keys, never raw paths/URLs
    const documentFrontKey = await this.storageService.upload(
      files.documentFront,
      storagePath,
    );

    const documentBackKey = files.documentBack
      ? await this.storageService.upload(files.documentBack, storagePath)
      : undefined;

    const selfieKey = await this.storageService.upload(
      files.selfie,
      storagePath,
    );

    const newKyc = this.kycRepository.create({
      userId,
      ...dto,
      documentFrontKey,
      documentBackKey,
      selfieKey,
      status: KycStatus.PENDING,
      tier: KycTier.TIER_0,
      submittedAt: new Date(),
    });

    await manager.save(newKyc);

    return {
      message: 'KYC submitted successfully',
      status: newKyc.status,
      tier: newKyc.tier,
    };
  });
}

  async resubmitKyc(
  userId: string,
  dto: ResubmitKycDto & {
    documentFrontUrl?: string;
    documentBackUrl?: string;
    selfieUrl?: string;
  },
) {
  return this.dataSource.transaction(async (manager) => {
    // Find the latest KYC record for this user
    const existingKyc = await manager.findOne(KycRecord, {
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    if (!existingKyc) {
      throw new BadRequestException(
        'No existing KYC submission found. Please submit a new one.',
      );
    }

    if (existingKyc.status !== KycStatus.RESUBMISSION_REQUIRED) {
      throw new BadRequestException(
        'Resubmission is only allowed when your KYC status is RESUBMISSION_REQUIRED.',
      );
    }

    if (!dto.documentFrontUrl) {
      throw new BadRequestException('documentFront file is required');
    }

    if (!dto.selfieUrl) {
      throw new BadRequestException('selfie file is required');
    }

    // Close the old RESUBMISSION_REQUIRED record, preserving original reason
    existingKyc.status = KycStatus.REJECTED;
    existingKyc.reviewedAt = new Date();
    await manager.save(existingKyc);

    // Create a new PENDING submission
    const newKyc = manager.create(KycRecord, {
      userId,
      ...dto,
      status: KycStatus.PENDING,
      tier: KycTier.TIER_0,
      submittedAt: new Date(),
    });

    await manager.save(newKyc);

    return {
      message: 'KYC resubmitted successfully',
      status: newKyc.status,
    };
  });
}

  async getKycStatus(userId: string) {
  const latestKyc = await this.kycRepository.findOne({
    where: { userId },
    order: { createdAt: 'DESC' },
  });

  if (!latestKyc) {
    return { status: 'not_submitted', tier: 0 };
  }

  return {
    id: latestKyc.id,
    status: latestKyc.status,
    tier: latestKyc.tier,
    documentType: latestKyc.documentType,
    documentNumber: latestKyc.documentNumber,
    rejectionReason: latestKyc.rejectionReason,
    submittedAt: latestKyc.submittedAt,
    reviewedAt: latestKyc.reviewedAt,
  };
}

  // ── Admin methods ──────────────────────────────────────────────

  async getKycQueue(status ?: KycStatus, page: number = 1, limit: number = 20) {
  const skip = (page - 1) * limit;
  const where: Record<string, unknown> = {};

  if (status) {
    where.status = status;
  }

  const [records, total] = await this.kycRepository.findAndCount({
    where,
    relations: ['user', 'reviewer'],
    order: { createdAt: 'ASC' },
    skip,
    take: limit,
  });

  return {
    data: records.map((r) => ({
      id: r.id,
      userId: r.userId,
      userEmail: r.user?.email ?? null,
      status: r.status,
      documentType: r.documentType,
      documentNumber: r.documentNumber,
      fullName: r.fullName,
      submittedAt: r.submittedAt,
      reviewedBy: r.reviewedBy,
      reviewedAt: r.reviewedAt,
      rejectionReason: r.rejectionReason,
    })),
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

  /** Returns pending KYC submissions with signed URLs for admin review */
  async listPendingKycWithUrls(): Promise < object[] > {
  const records = await this.kycRepository.find({
    where: { status: KycStatus.PENDING },
    relations: ['user'],
    order: { createdAt: 'ASC' },
  });
  return Promise.all(records.map((r) => this.toReviewDto(r)));
};

  async approveKyc(kycId: string, reviewerId: string) {
  return this.dataSource.transaction(async (manager) => {
    const kyc = await manager.findOne(KycRecord, {
      where: { id: kycId },
    });

    if (!kyc) {
      throw new NotFoundException('KYC record not found');
    }

    if (
      kyc.status === KycStatus.APPROVED ||
      kyc.status === KycStatus.REJECTED
    ) {
      throw new BadRequestException('KYC already reviewed');
    }

    if (kyc.status !== KycStatus.PENDING) {
      throw new BadRequestException(
        'Only pending submissions can be approved',
      );
    }

    const user = await manager.findOne(User, {
      where: { id: kyc.userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Update KYC record
    kyc.status = KycStatus.APPROVED;
    const userKycTier = this.resolveUserKycTier(kyc);
    const kycTierMap: Record<UserKycTier, KycTier> = {
      [UserKycTier.UNVERIFIED]: KycTier.TIER_0,
      [UserKycTier.BASIC]: KycTier.TIER_1,
      [UserKycTier.ENHANCED]: KycTier.TIER_2,
      [UserKycTier.FULL]: KycTier.TIER_2,
    };
    kyc.tier = kycTierMap[userKycTier];
    kyc.reviewedBy = reviewerId;
    kyc.reviewedAt = new Date();

    // Update user verification
    user.isVerified = true;
    user.kycTier = userKycTier;

    await manager.save(kyc);
    await manager.save(user);

    // Create in-app notification
    const notificationPayload: Partial<Notification> = {
      userId: user.id,
      type: NotificationType.SYSTEM,
      title: 'KYC Approved',
      message:
        'Your identity verification has been approved. You now have full access to higher transaction limits.',
      status: NotificationStatus.UNREAD,
      relatedId: kyc.id,
      metadata: {
        entity: 'KYC',
        kycStatus: 'approved',
        tier: userKycTier,
      },
    };
    await manager.save(Notification, notificationPayload);

    // Send push notification via Firebase
    if (user.fcmTokens && user.fcmTokens.length > 0) {
      this.firebaseService
        .sendToTokens(
          user.fcmTokens,
          'KYC Approved',
          'Your identity verification has been approved. You now have higher transaction limits.',
          { entity: 'KYC', kycStatus: 'approved' },
          {
            notificationId: notificationPayload.id ?? '',
            type: 'KYC_APPROVED',
            deepLink: 'nexafx://kyc/status',
            actionType: 'KYC_APPROVED',
            resourceId: kycRecord.id,
            resourceType: 'kyc',
            timestamp: new Date().toISOString(),
          },
        )
        .catch((err: Error) =>
          this.logger.error(`Failed to send KYC FCM: ${err.message}`),
        );
    }

    // Send approval email
    this.kycEmailService
      .sendApprovalEmail(user.email, user.firstName ?? 'User')
      .catch((err: Error) =>
        this.logger.error(
          `Failed to send KYC approval email: ${err.message}`,
        ),
      );

    // Dispatch webhook
    this.webhookService
      .dispatch('kyc.approved', kyc, user.id)
      .catch((err: Error) =>
        this.logger.error(`Webhook dispatch failed: ${err.message}`),
      );

    // Trigger sanctions screening asynchronously
    this.sanctionsService
      ?.screenUser(user.id)
      .catch((err: Error) =>
        this.logger.error(`Sanctions screening failed: ${err.message}`),
      );

    return {
      message: 'KYC approved successfully',
    };
  });
}

  async rejectKyc(
  kycId: string,
  reviewerId: string,
  reason: string,
  requireResubmission: boolean = false,
) {
  return this.dataSource.transaction(async (manager) => {
    const kyc = await manager.findOne(KycRecord, { where: { id: kycId } });

    if (!kyc) throw new BadRequestException('KYC record not found');

    if (
      kyc.status === KycStatus.APPROVED ||
      kyc.status === KycStatus.REJECTED
    ) {
      throw new BadRequestException('KYC already reviewed');
    }

    if (
      decision !== KycStatus.APPROVED &&
      decision !== KycStatus.REJECTED
    ) {
      throw new BadRequestException('Invalid decision');
    }

    const user = await manager.findOne(User, { where: { id: kyc.userId } });
    if (!user) throw new BadRequestException('User not found');

    let notificationPayload: Partial<Notification>;

    if (decision === KycStatus.APPROVED) {
      kyc.status = KycStatus.APPROVED;
      const tier = this.resolveUserKycTier(kyc);
      kyc.tier =
        tier === UserKycTier.BASIC
          ? KycTier.TIER_1
          : tier === UserKycTier.UNVERIFIED
            ? KycTier.TIER_0
            : KycTier.TIER_2;
      kyc.reviewedAt = new Date();
      user.isVerified = true;
      user.kycTier = tier;

      notificationPayload = {
        userId: user.id,
        type: NotificationType.SYSTEM,
        title: 'KYC Approved',
        message:
          'Your identity verification has been approved. You now have full access to higher transaction limits.',
        status: NotificationStatus.UNREAD,
        relatedId: kyc.id,
        metadata: { entity: 'KYC', kycStatus: 'approved', tier },
      };
    } else {
      kyc.status = KycStatus.REJECTED;
      kyc.rejectionReason = reason || 'KYC rejected';
      kyc.reviewedAt = new Date();
      user.isVerified = false;
      user.kycTier = UserKycTier.UNVERIFIED;
    }

    await manager.save(kyc);
    await manager.save(user);

    // Create in-app notification
    const notificationMessage =
      newStatus === KycStatus.RESUBMISSION_REQUIRED
        ? `Your KYC submission requires changes. Reason: ${reason}`
        : `Your KYC submission was rejected. Reason: ${reason}`;

    const notificationPayload: Partial<Notification> = {
      userId: user.id,
      type: NotificationType.SYSTEM,
      title:
        newStatus === KycStatus.RESUBMISSION_REQUIRED
          ? 'KYC Resubmission Required'
          : 'KYC Rejected',
      message: notificationMessage,
      status: NotificationStatus.UNREAD,
      relatedId: kyc.id,
      metadata: {
        entity: 'KYC',
        kycStatus: newStatus,
        reason,
      },
    };
    await manager.save(Notification, notificationPayload);

    // Send push notification via Firebase
    if (user.fcmTokens && user.fcmTokens.length > 0) {
      this.firebaseService
        .sendToTokens(
          user.fcmTokens,
          notificationPayload.title!,
          notificationPayload.message!,
          { entity: 'KYC', kycStatus: decision.toLowerCase() },
          {
            notificationId: notificationPayload.id ?? '',
            type: 'KYC_REJECTED',
            deepLink: 'nexafx://kyc/status',
            actionType: 'KYC_REJECTED',
            resourceId: kyc.id,
            resourceType: 'kyc',
            timestamp: new Date().toISOString(),
          },
        )
        .catch((err: Error) =>
          this.logger.error(`Failed to send KYC FCM: ${err.message}`),
        );
    }

    // Dispatch webhook
    const webhookEvent =
      newStatus === KycStatus.RESUBMISSION_REQUIRED
        ? 'kyc.resubmission_required'
        : 'kyc.rejected';
    this.webhookService
      .dispatch(webhookEvent, kyc, user.id)
      .catch((err: Error) =>
        this.logger.error(`Webhook dispatch failed: ${err.message}`),
      );

    // Send rejection email
    this.kycEmailService
      .sendRejectionEmail(
        user.email,
        user.firstName ?? 'User',
        reason,
        newStatus === KycStatus.RESUBMISSION_REQUIRED,
      )
      .catch((err: Error) =>
        this.logger.error(
          `Failed to send KYC rejection email: ${err.message}`,
        ),
      );

    return {
      message:
        newStatus === KycStatus.RESUBMISSION_REQUIRED
          ? 'KYC resubmission requested successfully'
          : 'KYC rejected successfully',
    };
  });
}

  /** Convert a KycRecord to a review DTO with temporary signed URLs */
  async toReviewDto(kyc: KycRecord): Promise < object > {
  const [documentFrontUrl, selfieUrl, documentBackUrl] = await Promise.all([
    this.storageService.getSignedUrl(
      kyc.documentFrontKey,
      SIGNED_URL_EXPIRY_SECONDS,
    ),
    this.storageService.getSignedUrl(
      kyc.selfieKey,
      SIGNED_URL_EXPIRY_SECONDS,
    ),
    kyc.documentBackKey
      ? this.storageService.getSignedUrl(
        kyc.documentBackKey,
        SIGNED_URL_EXPIRY_SECONDS,
      )
      : Promise.resolve(null),
  ]);

  return {
    id: kyc.id,
    userId: kyc.userId,
    status: kyc.status,
    tier: kyc.tier,
    fullName: kyc.fullName,
    dateOfBirth: kyc.dateOfBirth,
    nationality: kyc.nationality,
    documentType: kyc.documentType,
    documentNumber: kyc.documentNumber,
    documentFrontUrl,
    documentBackUrl,
    selfieUrl,
    rejectionReason: kyc.rejectionReason,
    submittedAt: kyc.submittedAt,
    reviewedAt: kyc.reviewedAt,
    createdAt: kyc.createdAt,
  };
}

  private resolveUserKycTier(kyc: KycRecord): UserKycTier {
  const hasId = !!kyc.documentFrontKey;
  const hasSelfie = !!kyc.selfieKey;
  const hasProofOfAddress = !!kyc.documentBackKey;

  if (hasId && hasSelfie && hasProofOfAddress) return UserKycTier.FULL;
  if (hasId && hasSelfie) return UserKycTier.ENHANCED;
  if (hasId) return UserKycTier.BASIC;
  return UserKycTier.UNVERIFIED;
}
}
