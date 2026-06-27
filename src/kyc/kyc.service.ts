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
import { validateSelfieVideo } from '../common/helpers/video-duration-scanner.helper';
import { SanctionsService } from '../sanctions/sanctions.service';

const SIGNED_URL_EXPIRY_SECONDS = 900;

@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);

  constructor(
    @InjectRepository(KYCApplication)
    private kycRepository: Repository<KYCApplication>,
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
  ) {}

  async submitKyc(
    userId: string,
    targetTier: UserKycTier.STANDARD | UserKycTier.ENHANCED,
    files: {
      governmentId?: Express.Multer.File;
      proofOfAddress?: Express.Multer.File;
      selfieVideo?: Express.Multer.File;
    },
  ) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.kycTier === UserKycTier.NONE) {
      throw new BadRequestException('User must verify email to reach BASIC tier first.');
    }

    if (targetTier === UserKycTier.STANDARD && user.kycTier !== UserKycTier.BASIC) {
      throw new BadRequestException('STANDARD tier requires BASIC tier first.');
    }

    if (targetTier === UserKycTier.ENHANCED && user.kycTier !== UserKycTier.STANDARD) {
      throw new BadRequestException('ENHANCED tier requires STANDARD tier first.');
    }

    // Check for active submission
    const existingActiveKyc = await this.kycRepository.findOne({
      where: [
        { userId, status: KycStatus.PENDING },
      ],
    });

    if (existingActiveKyc) {
      throw new BadRequestException('You already have a KYC submission under review.');
    }

    const documents: Record<string, string> = {};
    const storagePath = `kyc/${userId}`;

    if (targetTier === UserKycTier.STANDARD) {
      if (!files.governmentId) throw new BadRequestException('Government ID is required for STANDARD tier.');
      await scanBuffer(files.governmentId.buffer);
      documents['governmentId'] = await this.storageService.upload(files.governmentId, storagePath);
    }

    if (targetTier === UserKycTier.ENHANCED) {
      if (!files.proofOfAddress) throw new BadRequestException('Proof of Address is required for ENHANCED tier.');
      if (!files.selfieVideo) throw new BadRequestException('Selfie Video is required for ENHANCED tier.');
      
      await scanBuffer(files.proofOfAddress.buffer);
      await scanBuffer(files.selfieVideo.buffer);
      await validateSelfieVideo(files.selfieVideo.buffer);

      documents['proofOfAddress'] = await this.storageService.upload(files.proofOfAddress, storagePath);
      documents['selfieVideo'] = await this.storageService.upload(files.selfieVideo, storagePath);
    }

    const newKyc = this.kycRepository.create({
      userId,
      targetTier,
      documents,
      status: KycStatus.PENDING,
    });

    await this.kycRepository.save(newKyc);

    return {
      message: 'KYC submitted successfully',
      status: newKyc.status,
      targetTier: newKyc.targetTier,
    };
  }

  async resubmitKyc(
    userId: string,
    targetTier: UserKycTier.STANDARD | UserKycTier.ENHANCED,
    files: {
      governmentId?: Express.Multer.File;
      proofOfAddress?: Express.Multer.File;
      selfieVideo?: Express.Multer.File;
    },
  ) {
    return this.dataSource.transaction(async (manager) => {
      const existingKyc = await manager.findOne(KYCApplication, {
        where: { userId },
        order: { createdAt: 'DESC' },
      });

      if (!existingKyc || existingKyc.status !== KycStatus.RESUBMISSION_REQUIRED) {
        throw new BadRequestException('Resubmission is only allowed when your KYC status is RESUBMISSION_REQUIRED.');
      }

      existingKyc.status = KycStatus.REJECTED;
      existingKyc.reviewedAt = new Date();
      await manager.save(existingKyc);

      const documents: Record<string, string> = {};
      const storagePath = `kyc/${userId}`;

      if (targetTier === UserKycTier.STANDARD) {
        if (!files.governmentId) throw new BadRequestException('Government ID is required for STANDARD tier.');
        await scanBuffer(files.governmentId.buffer);
        documents['governmentId'] = await this.storageService.upload(files.governmentId, storagePath);
      }
  
      if (targetTier === UserKycTier.ENHANCED) {
        if (!files.proofOfAddress) throw new BadRequestException('Proof of Address is required for ENHANCED tier.');
        if (!files.selfieVideo) throw new BadRequestException('Selfie Video is required for ENHANCED tier.');
        
        await scanBuffer(files.proofOfAddress.buffer);
        await scanBuffer(files.selfieVideo.buffer);
        await validateSelfieVideo(files.selfieVideo.buffer);
  
        documents['proofOfAddress'] = await this.storageService.upload(files.proofOfAddress, storagePath);
        documents['selfieVideo'] = await this.storageService.upload(files.selfieVideo, storagePath);
      }

      const newKyc = manager.create(KYCApplication, {
        userId,
        targetTier,
        documents,
        status: KycStatus.PENDING,
      });

      await manager.save(newKyc);

      return {
        message: 'KYC resubmitted successfully',
        status: newKyc.status,
        targetTier: newKyc.targetTier,
      };
    });
  }

  async getKycStatus(userId: string) {
    const latestKyc = await this.kycRepository.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    if (!latestKyc) {
      return { status: 'NOT_SUBMITTED', targetTier: null };
    }

    return {
      id: latestKyc.id,
      status: latestKyc.status,
      targetTier: latestKyc.targetTier,
      rejectionReason: latestKyc.rejectionReason,
      createdAt: latestKyc.createdAt,
      reviewedAt: latestKyc.reviewedAt,
    };
  }

  async getKycQueue(status?: KycStatus, page: number = 1, limit: number = 20) {
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
        throw new BadRequestException('Only pending submissions can be approved');
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
        message: \`Your identity verification for \${kyc.targetTier} tier has been approved.\`,
        status: NotificationStatus.UNREAD,
        relatedId: kyc.id,
        metadata: { entity: 'KYC', kycStatus: 'approved', tier: kyc.targetTier },
      };
      await manager.save(Notification, notificationPayload);

      if (user.fcmTokens && user.fcmTokens.length > 0) {
        this.firebaseService
          .sendToTokens(
            user.fcmTokens,
            'KYC Approved',
            \`Your identity verification for \${kyc.targetTier} tier has been approved.\`,
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
            this.logger.error(\`Failed to send KYC FCM: \${err.message}\`),
          );
      }

      this.webhookService
        .dispatch('kyc.approved', kyc, user.id)
        .catch((err: Error) =>
          this.logger.error(\`Webhook dispatch failed: \${err.message}\`),
        );

      this.sanctionsService
        ?.screenUser(user.id)
        .catch((err: Error) =>
          this.logger.error(\`Sanctions screening failed: \${err.message}\`),
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
      const kyc = await manager.findOne(KYCApplication, { where: { id: kycId } });

      if (!kyc) throw new BadRequestException('KYC application not found');

      if (kyc.status !== KycStatus.PENDING) {
        throw new BadRequestException('KYC already reviewed');
      }

      const user = await manager.findOne(User, { where: { id: kyc.userId } });
      if (!user) throw new BadRequestException('User not found');

      const newStatus = requireResubmission ? KycStatus.RESUBMISSION_REQUIRED : KycStatus.REJECTED;

      kyc.status = newStatus;
      kyc.rejectionReason = reason || 'KYC rejected';
      kyc.reviewedBy = reviewerId;
      kyc.reviewedAt = new Date();

      await manager.save(kyc);

      const notificationMessage =
        newStatus === KycStatus.RESUBMISSION_REQUIRED
          ? \`Your KYC submission requires changes. Reason: \${reason}\`
          : \`Your KYC submission was rejected. Reason: \${reason}\`;

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
            this.logger.error(\`Failed to send KYC FCM: \${err.message}\`),
          );
      }

      const webhookEvent =
        newStatus === KycStatus.RESUBMISSION_REQUIRED
          ? 'kyc.resubmission_required'
          : 'kyc.rejected';
      this.webhookService
        .dispatch(webhookEvent, kyc, user.id)
        .catch((err: Error) =>
          this.logger.error(\`Webhook dispatch failed: \${err.message}\`),
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
