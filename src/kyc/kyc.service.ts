import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { Express } from 'express';
import {
  KYCApplication,
  ApplicationStatus,
  ApplicationTargetTier,
} from './entities/kyc-application.entity';
import { User, UserKycTier } from '../users/user.entity';
import { ApplyKycDto } from './dtos/apply-kyc';
import { RejectKycDto } from './dtos/reject-kyc';
import { Notification } from '../notifications/entities/notification.entity';
import { NotificationType } from '../notifications/entities/notification.entity';
import { NotificationStatus } from '../notifications/entities/notification.entity';
import { FirebaseService } from '../firebase/firebase.service';

@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);

  constructor(
    @InjectRepository(KYCApplication)
    private kycApplicationRepository: Repository<KYCApplication>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
    private readonly dataSource: DataSource,
    private readonly firebaseService: FirebaseService,
  ) {}

  async applyForTier(
    userId: string,
    targetTier: ApplicationTargetTier,
    files: Record<string, Express.Multer.File[]>,
  ) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const currentTier = user.kycTier;

    if (currentTier === UserKycTier.ENHANCED) {
      throw new BadRequestException(
        'You already have the highest KYC tier (ENHANCED)',
      );
    }

    if (targetTier === ApplicationTargetTier.STANDARD) {
      if (currentTier !== UserKycTier.BASIC) {
        throw new BadRequestException(
          'You must have BASIC tier before applying for STANDARD',
        );
      }
    }

    if (targetTier === ApplicationTargetTier.ENHANCED) {
      if (currentTier !== UserKycTier.STANDARD) {
        throw new BadRequestException(
          'You must have STANDARD tier before applying for ENHANCED',
        );
      }
    }

    const existingActive = await this.kycApplicationRepository.findOne({
      where: [
        { userId, status: ApplicationStatus.PENDING },
        { userId, status: ApplicationStatus.RESUBMISSION_REQUIRED },
      ],
    });

    if (existingActive) {
      throw new ConflictException(
        'You already have a KYC application under review',
      );
    }

    this.validateDocuments(files, targetTier);

    const documents = this.buildDocuments(files, targetTier);

    const application = this.kycApplicationRepository.create({
      userId,
      targetTier,
      documents,
      status: ApplicationStatus.PENDING,
    });

    await this.kycApplicationRepository.save(application);

    return {
      message: 'KYC application submitted successfully',
      applicationId: application.id,
      status: application.status,
      targetTier: application.targetTier,
    };
  }

  async resubmitApplication(
    applicationId: string,
    userId: string,
    files: Record<string, Express.Multer.File[]>,
  ) {
    const application = await this.kycApplicationRepository.findOne({
      where: { id: applicationId },
    });

    if (!application) {
      throw new NotFoundException('KYC application not found');
    }

    if (application.userId !== userId) {
      throw new BadRequestException('You do not own this application');
    }

    if (application.status !== ApplicationStatus.RESUBMISSION_REQUIRED) {
      throw new BadRequestException(
        'This application is not awaiting resubmission',
      );
    }

    const documents = this.buildDocuments(files, application.targetTier);

    application.status = ApplicationStatus.PENDING;
    application.documents = documents;
    application.rejectionReason = null;
    application.reviewedAt = null;

    await this.kycApplicationRepository.save(application);

    return {
      message: 'KYC documents resubmitted successfully',
      applicationId: application.id,
      status: application.status,
    };
  }

  async getUserKycStatus(userId: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const activeApplication = await this.kycApplicationRepository.findOne({
      where: [
        { userId, status: ApplicationStatus.PENDING },
        { userId, status: ApplicationStatus.RESUBMISSION_REQUIRED },
      ],
      order: { submittedAt: 'DESC' },
    });

    const nextTierRequirements = this.getNextTierRequirements(user.kycTier);

    return {
      currentTier: user.kycTier,
      activeApplication: activeApplication
        ? {
            id: activeApplication.id,
            targetTier: activeApplication.targetTier,
            status: activeApplication.status,
            submittedAt: activeApplication.submittedAt,
            rejectionReason: activeApplication.rejectionReason,
          }
        : null,
      nextTier: nextTierRequirements,
    };
  }

  async getPendingApplications(targetTier?: ApplicationTargetTier) {
    const query = this.kycApplicationRepository
      .createQueryBuilder('app')
      .leftJoinAndSelect('app.user', 'user')
      .where('app.status = :status', { status: ApplicationStatus.PENDING })
      .orderBy('app.submittedAt', 'ASC');

    if (targetTier) {
      query.andWhere('app.targetTier = :targetTier', { targetTier });
    }

    return query.getMany();
  }

  async approveApplication(applicationId: string, adminId: string) {
    const application = await this.kycApplicationRepository.findOne({
      where: { id: applicationId },
    });

    if (!application) {
      throw new NotFoundException('KYC application not found');
    }

    if (application.status !== ApplicationStatus.PENDING) {
      throw new BadRequestException(
        'Application has already been processed',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(User, {
        where: { id: application.userId },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      application.status = ApplicationStatus.APPROVED;
      application.reviewedBy = adminId;
      application.reviewedAt = new Date();

      const newTier =
        application.targetTier === ApplicationTargetTier.STANDARD
          ? UserKycTier.STANDARD
          : UserKycTier.ENHANCED;

      user.kycTier = newTier;

      await manager.save(application);
      await manager.save(user);

      const notificationPayload: Partial<Notification> = {
        userId: user.id,
        type: NotificationType.SYSTEM,
        title: 'KYC Approved',
        message: `Your ${application.targetTier.toLowerCase()} KYC verification has been approved. Your transaction limits have been updated.`,
        status: NotificationStatus.UNREAD,
        relatedId: application.id,
        metadata: {
          entity: 'KYC',
          kycStatus: 'approved',
          tier: newTier,
        },
      };

      await manager.save(Notification, notificationPayload);

      if (user.fcmTokens && user.fcmTokens.length > 0) {
        this.firebaseService
          .sendToTokens(
            user.fcmTokens,
            notificationPayload.title!,
            notificationPayload.message!,
            {
              entity: 'KYC',
              kycStatus: 'approved',
            },
          )
          .catch((err) =>
            this.logger.error(`Failed to send KYC FCM: ${err.message}`),
          );
      }

      return {
        message: 'KYC application approved successfully',
        userId: user.id,
        newTier,
      };
    });
  }

  async rejectApplication(
    applicationId: string,
    adminId: string,
    dto: RejectKycDto,
  ) {
    const application = await this.kycApplicationRepository.findOne({
      where: { id: applicationId },
    });

    if (!application) {
      throw new NotFoundException('KYC application not found');
    }

    if (application.status !== ApplicationStatus.PENDING) {
      throw new BadRequestException(
        'Application has already been processed',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(User, {
        where: { id: application.userId },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      application.status = dto.requiresResubmission
        ? ApplicationStatus.RESUBMISSION_REQUIRED
        : ApplicationStatus.REJECTED;
      application.rejectionReason = dto.reason || 'KYC application rejected';
      application.reviewedBy = adminId;
      application.reviewedAt = new Date();

      await manager.save(application);

      const notificationPayload: Partial<Notification> = {
        userId: user.id,
        type: NotificationType.SYSTEM,
        title: dto.requiresResubmission
          ? 'KYC Resubmission Required'
          : 'KYC Rejected',
        message: dto.requiresResubmission
          ? `Your KYC application requires resubmission. Reason: ${application.rejectionReason}`
          : `Your KYC application was rejected. Reason: ${application.rejectionReason}`,
        status: NotificationStatus.UNREAD,
        relatedId: application.id,
        metadata: {
          entity: 'KYC',
          kycStatus: dto.requiresResubmission
            ? 'resubmission_required'
            : 'rejected',
          reason: application.rejectionReason,
        },
      };

      await manager.save(Notification, notificationPayload);

      if (user.fcmTokens && user.fcmTokens.length > 0) {
        this.firebaseService
          .sendToTokens(
            user.fcmTokens,
            notificationPayload.title!,
            notificationPayload.message!,
            {
              entity: 'KYC',
              kycStatus: dto.requiresResubmission
                ? 'resubmission_required'
                : 'rejected',
            },
          )
          .catch((err) =>
            this.logger.error(`Failed to send KYC FCM: ${err.message}`),
          );
      }

      return {
        message: `KYC application ${application.status.toLowerCase()} successfully`,
        applicationId: application.id,
        status: application.status,
      };
    });
  }

  private validateDocuments(
    files: Record<string, Express.Multer.File[]>,
    targetTier: ApplicationTargetTier,
  ) {
    const requiredStandard = [
      'governmentIdFront',
      'governmentIdBack',
      'selfie',
    ];

    const requiredEnhanced = [
      ...requiredStandard,
      'proofOfAddress',
      'videoSelfie',
    ];

    const required =
      targetTier === ApplicationTargetTier.ENHANCED
        ? requiredEnhanced
        : requiredStandard;

    for (const doc of required) {
      if (!files[doc] || files[doc].length === 0) {
        throw new BadRequestException(
          `${doc} is required for ${targetTier} KYC verification`,
        );
      }
    }
  }

  private buildDocuments(
    files: Record<string, Express.Multer.File[]>,
    targetTier: ApplicationTargetTier,
  ): Record<string, { path: string; mimeType: string }> {
    const documents: Record<string, { path: string; mimeType: string }> = {};

    const addDocument = (key: string, fileArray: Express.Multer.File[] | undefined) => {
      if (fileArray && fileArray.length > 0) {
        const file = fileArray[0];
        documents[key] = {
          path: file.path,
          mimeType: file.mimetype,
        };
      }
    };

    addDocument('governmentIdFront', files.governmentIdFront);
    addDocument('governmentIdBack', files.governmentIdBack);
    addDocument('selfie', files.selfie);
    addDocument('proofOfAddress', files.proofOfAddress);
    addDocument('videoSelfie', files.videoSelfie);

    return documents;
  }

  private getNextTierRequirements(currentTier: UserKycTier) {
    if (currentTier === UserKycTier.NONE) {
      return {
        nextTier: UserKycTier.BASIC,
        requirements: ['Email verification (automatic)'],
      };
    }

    if (currentTier === UserKycTier.BASIC) {
      return {
        nextTier: UserKycTier.STANDARD,
        requirements: [
          'Government ID (front and back)',
          'Selfie photo',
        ],
      };
    }

    if (currentTier === UserKycTier.STANDARD) {
      return {
        nextTier: UserKycTier.ENHANCED,
        requirements: [
          'Proof of address (utility bill or bank statement, < 3 months old)',
          'Video selfie (max 30 seconds, max 50MB)',
        ],
      };
    }

    return null;
  }
}
