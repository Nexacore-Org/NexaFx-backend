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
import { KYCApplication, KycStatus } from './entities/kyc-application.entity';
import { User, UserKycTier } from '../users/user.entity';
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
import { validateSelfieVideo } from '../common/helpers/video-duration-scanner.helper';
import { SanctionsService } from '../sanctions/sanctions.service';
import { NotificationsService } from '../notifications/notifications.service';

type DocumentFiles = {
  governmentIdFront?: Express.Multer.File;
  governmentIdBack?: Express.Multer.File;
  selfie?: Express.Multer.File;
  proofOfAddress?: Express.Multer.File;
  videoSelfie?: Express.Multer.File;
};

@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);

  constructor(
    @InjectRepository(KYCApplication)
    private kycRepository: Repository<KYCApplication>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly firebaseService: FirebaseService,
    private readonly notificationsService: NotificationsService,
    private readonly webhookService: WebhookService,
    @Inject(STORAGE_SERVICE_TOKEN)
    private readonly storageService: StorageService,
    @Optional()
    private readonly sanctionsService?: SanctionsService,
  ) {}

  async applyForKyc(
    userId: string,
    targetTier: UserKycTier.STANDARD | UserKycTier.ENHANCED,
    files: DocumentFiles,
  ) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.kycTier === UserKycTier.NONE) {
      throw new BadRequestException(
        'User must verify email to reach BASIC tier first.',
      );
    }

    if (
      targetTier === UserKycTier.STANDARD &&
      user.kycTier !== UserKycTier.BASIC
    ) {
      throw new BadRequestException(
        'STANDARD tier requires BASIC tier first. Please verify your email.',
      );
    }

    if (
      targetTier === UserKycTier.ENHANCED &&
      user.kycTier !== UserKycTier.STANDARD
    ) {
      throw new BadRequestException(
        'ENHANCED tier requires STANDARD tier first. Please apply for STANDARD first.',
      );
    }

    const existingActiveKyc = await this.kycRepository.findOne({
      where: { userId, status: KycStatus.PENDING },
    });

    if (existingActiveKyc) {
      throw new BadRequestException(
        'You already have a KYC submission under review.',
      );
    }

    const documents: Record<string, { s3Key: string; mimeType: string }> = {};
    const storagePath = `kyc/${userId}`;

    if (targetTier === UserKycTier.STANDARD) {
      if (!files.governmentIdFront) {
        throw new BadRequestException(
          'Government ID front is required for STANDARD tier.',
        );
      }
      if (!files.selfie) {
        throw new BadRequestException('Selfie is required for STANDARD tier.');
      }

      await scanBuffer(files.governmentIdFront.buffer);
      await scanBuffer(files.selfie.buffer);

      documents['governmentIdFront'] = {
        s3Key: await this.storageService.upload(
          files.governmentIdFront,
          storagePath,
        ),
        mimeType: files.governmentIdFront.mimetype,
      };

      if (files.governmentIdBack) {
        documents['governmentIdBack'] = {
          s3Key: await this.storageService.upload(
            files.governmentIdBack,
            storagePath,
          ),
          mimeType: files.governmentIdBack.mimetype,
        };
      }

      documents['selfie'] = {
        s3Key: await this.storageService.upload(files.selfie, storagePath),
        mimeType: files.selfie.mimetype,
      };
    }

    if (targetTier === UserKycTier.ENHANCED) {
      if (!files.proofOfAddress) {
        throw new BadRequestException(
          'Proof of Address is required for ENHANCED tier.',
        );
      }
      if (!files.videoSelfie) {
        throw new BadRequestException(
          'Video Selfie is required for ENHANCED tier.',
        );
      }

      await scanBuffer(files.proofOfAddress.buffer);
      await scanBuffer(files.videoSelfie.buffer);
      await validateSelfieVideo(files.videoSelfie.buffer);

      documents['proofOfAddress'] = {
        s3Key: await this.storageService.upload(
          files.proofOfAddress,
          storagePath,
        ),
        mimeType: files.proofOfAddress.mimetype,
      };

      documents['videoSelfie'] = {
        s3Key: await this.storageService.upload(
          files.videoSelfie,
          storagePath,
        ),
        mimeType: files.videoSelfie.mimetype,
      };
    }

    const newKyc = this.kycRepository.create({
      userId,
      targetTier,
      documents,
      status: KycStatus.PENDING,
      submittedAt: new Date(),
    });

    await this.kycRepository.save(newKyc);

    return {
      message: 'KYC submitted successfully',
      status: newKyc.status,
      targetTier: newKyc.targetTier,
    };
  }

  async resubmitKyc(
    applicationId: string,
    userId: string,
    targetTier: UserKycTier.STANDARD | UserKycTier.ENHANCED,
    files: DocumentFiles,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const existingKyc = await manager.findOne(KYCApplication, {
        where: { id: applicationId, userId },
      });

      if (
        !existingKyc ||
        existingKyc.status !== KycStatus.RESUBMISSION_REQUIRED
      ) {
        throw new BadRequestException(
          'Resubmission is only allowed when your KYC status is RESUBMISSION_REQUIRED.',
        );
      }

      const documents: Record<string, { s3Key: string; mimeType: string }> = {};
      const storagePath = `kyc/${userId}`;

      if (targetTier === UserKycTier.STANDARD) {
        if (!files.governmentIdFront) {
          throw new BadRequestException(
            'Government ID front is required for STANDARD tier.',
          );
        }
        if (!files.selfie) {
          throw new BadRequestException(
            'Selfie is required for STANDARD tier.',
          );
        }

        await scanBuffer(files.governmentIdFront.buffer);
        await scanBuffer(files.selfie.buffer);

        documents['governmentIdFront'] = {
          s3Key: await this.storageService.upload(
            files.governmentIdFront,
            storagePath,
          ),
          mimeType: files.governmentIdFront.mimetype,
        };

        if (files.governmentIdBack) {
          documents['governmentIdBack'] = {
            s3Key: await this.storageService.upload(
              files.governmentIdBack,
              storagePath,
            ),
            mimeType: files.governmentIdBack.mimetype,
          };
        }

        documents['selfie'] = {
          s3Key: await this.storageService.upload(files.selfie, storagePath),
          mimeType: files.selfie.mimetype,
        };
      }

      if (targetTier === UserKycTier.ENHANCED) {
        if (!files.proofOfAddress) {
          throw new BadRequestException(
            'Proof of Address is required for ENHANCED tier.',
          );
        }
        if (!files.videoSelfie) {
          throw new BadRequestException(
            'Video Selfie is required for ENHANCED tier.',
          );
        }

        await scanBuffer(files.proofOfAddress.buffer);
        await scanBuffer(files.videoSelfie.buffer);
        await validateSelfieVideo(files.videoSelfie.buffer);

        documents['proofOfAddress'] = {
          s3Key: await this.storageService.upload(
            files.proofOfAddress,
            storagePath,
          ),
          mimeType: files.proofOfAddress.mimetype,
        };

        documents['videoSelfie'] = {
          s3Key: await this.storageService.upload(
            files.videoSelfie,
            storagePath,
          ),
          mimeType: files.videoSelfie.mimetype,
        };
      }

      existingKyc.status = KycStatus.PENDING;
      existingKyc.documents = documents;
      existingKyc.rejectionReason = null;
      existingKyc.reviewedBy = null;
      existingKyc.reviewedAt = null;
      existingKyc.submittedAt = new Date();

      await manager.save(existingKyc);

      return {
        message: 'KYC resubmitted successfully',
        status: existingKyc.status,
        targetTier: existingKyc.targetTier,
      };
    });
  }

  async getKycStatus(userId: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const latestKyc = await this.kycRepository.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    const nextTier = this.getNextTier(user.kycTier);
    const requiredDocuments = this.getRequiredDocuments(nextTier);

    if (!latestKyc) {
      return {
        currentTier: user.kycTier,
        application: null,
        nextTier: nextTier ?? null,
        requiredDocuments: nextTier ? requiredDocuments : [],
      };
    }

    return {
      currentTier: user.kycTier,
      application: {
        id: latestKyc.id,
        targetTier: latestKyc.targetTier,
        status: latestKyc.status,
        rejectionReason: latestKyc.rejectionReason,
        createdAt: latestKyc.createdAt,
        reviewedAt: latestKyc.reviewedAt,
      },
      nextTier: nextTier ?? null,
      requiredDocuments: nextTier ? requiredDocuments : [],
    };
  }

  private getNextTier(currentTier: UserKycTier): UserKycTier | null {
    if (currentTier === UserKycTier.NONE) return UserKycTier.BASIC;
    if (currentTier === UserKycTier.BASIC) return UserKycTier.STANDARD;
    if (currentTier === UserKycTier.STANDARD) return UserKycTier.ENHANCED;
    return null;
  }

  private getRequiredDocuments(tier: UserKycTier | null): string[] {
    if (tier === UserKycTier.BASIC) {
      return ['emailVerification'];
    }
    if (tier === UserKycTier.STANDARD) {
      return ['governmentIdFront', 'governmentIdBack', 'selfie'];
    }
    if (tier === UserKycTier.ENHANCED) {
      return ['proofOfAddress', 'videoSelfie'];
    }
    return [];
  }

  async getKycQueue(
    tier?: UserKycTier.STANDARD | UserKycTier.ENHANCED,
    status?: KycStatus,
    page: number = 1,
    limit: number = 20,
  ) {
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = {};

    if (tier) {
      where.targetTier = tier;
    }
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
        targetTier: r.targetTier,
        createdAt: r.createdAt,
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

  async approveKyc(kycId: string, reviewerId: string) {
    return this.dataSource.transaction(async (manager) => {
      const kyc = await manager.findOne(KYCApplication, {
        where: { id: kycId },
      });

      if (!kyc) throw new NotFoundException('KYC application not found');

      if (kyc.status !== KycStatus.PENDING) {
        throw new BadRequestException(
          'Only pending submissions can be approved',
        );
      }

      const user = await manager.findOne(User, { where: { id: kyc.userId } });
      if (!user) throw new NotFoundException('User not found');

      kyc.status = KycStatus.APPROVED;
      kyc.reviewedBy = reviewerId;
      kyc.reviewedAt = new Date();

      user.kycTier = kyc.targetTier;

      await manager.save(kyc);
      await manager.save(user);

      const notificationPayload: Partial<Notification> = {
        userId: user.id,
        type: NotificationType.SYSTEM,
        title: 'KYC Approved',
        message: `Your identity verification for ${kyc.targetTier} tier has been approved.`,
        status: NotificationStatus.UNREAD,
        relatedId: kyc.id,
        metadata: {
          entity: 'KYC',
          kycStatus: 'approved',
          tier: kyc.targetTier,
        },
      };
      await manager.save(Notification, notificationPayload);

      if (user.fcmTokens && user.fcmTokens.length > 0) {
        this.firebaseService
          .sendToTokens(
            user.fcmTokens,
            'KYC Approved',
            `Your identity verification for ${kyc.targetTier} tier has been approved.`,
            { entity: 'KYC', kycStatus: 'approved' },
            {
              notificationId: notificationPayload.id ?? '',
              type: 'KYC_APPROVED',
              deepLink: 'nexafx://kyc/status',
              actionType: 'KYC_APPROVED',
              resourceId: kyc.id,
              resourceType: 'kyc',
              timestamp: new Date().toISOString(),
            },
          )
          .catch((err: Error) =>
            this.logger.error(`Failed to send KYC FCM: ${err.message}`),
          );
      }

      this.webhookService
        .dispatch('kyc.approved', kyc, user.id)
        .catch((err: Error) =>
          this.logger.error(`Webhook dispatch failed: ${err.message}`),
        );

      this.sanctionsService
        ?.screenUser(user.id)
        .catch((err: Error) =>
          this.logger.error(`Sanctions screening failed: ${err.message}`),
        );

      return { message: 'KYC approved successfully' };
    });
  }

  async rejectKyc(
    kycId: string,
    reviewerId: string,
    reason: string,
    requireResubmission: boolean = false,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const kyc = await manager.findOne(KYCApplication, {
        where: { id: kycId },
      });

      if (!kyc) throw new BadRequestException('KYC application not found');

      if (kyc.status !== KycStatus.PENDING) {
        throw new BadRequestException('KYC already reviewed');
      }

      const user = await manager.findOne(User, { where: { id: kyc.userId } });
      if (!user) throw new BadRequestException('User not found');

      const newStatus = requireResubmission
        ? KycStatus.RESUBMISSION_REQUIRED
        : KycStatus.REJECTED;

      kyc.status = newStatus;
      kyc.rejectionReason = reason || 'KYC rejected';
      kyc.reviewedBy = reviewerId;
      kyc.reviewedAt = new Date();

      await manager.save(kyc);

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
        metadata: { entity: 'KYC', kycStatus: newStatus, reason },
      };
      await manager.save(Notification, notificationPayload);

      if (user.fcmTokens && user.fcmTokens.length > 0) {
        this.firebaseService
          .sendToTokens(
            user.fcmTokens,
            notificationPayload.title!,
            notificationPayload.message!,
            { entity: 'KYC', kycStatus: newStatus.toLowerCase() },
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

      const webhookEvent =
        newStatus === KycStatus.RESUBMISSION_REQUIRED
          ? 'kyc.resubmission_required'
          : 'kyc.rejected';
      this.webhookService
        .dispatch(webhookEvent, kyc, user.id)
        .catch((err: Error) =>
          this.logger.error(`Webhook dispatch failed: ${err.message}`),
        );

      return {
        message:
          newStatus === KycStatus.RESUBMISSION_REQUIRED
            ? 'KYC resubmission requested successfully'
            : 'KYC rejected successfully',
      };
    });
  }
}