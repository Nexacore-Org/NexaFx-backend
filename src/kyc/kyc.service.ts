import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { KycRecord, KycStatus, KycTier } from './entities/kyc.entity';
import { ApproveKycDto } from './dtos/kyc-approve';
import { ReviewKycDto } from './dtos/kyc-review';
import { User } from '../users/user.entity';
import { SubmitKycDto } from './dtos/kyc-submit';
import { ConfigService } from '@nestjs/config';
import { Notification } from 'src/notifications/entities/notification.entity';
import { NotificationType } from 'src/notifications/entities/notification.entity';
import { NotificationStatus } from 'src/notifications/entities/notification.entity';
import { NotificationCategory } from 'src/notifications/enum/notificationCategory.enum';
import { NotificationPriority } from 'src/notifications/enum/notificationPriority.enum';
import { NotificationChannel } from 'src/notifications/enum/notificationChannel.enum';

@Injectable()

export class KycService {
    constructor(
    @InjectRepository(KycRecord)
    private kycRepository: Repository<KycRecord>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private configService: ConfigService,
    private readonly dataSource: DataSource
  ) {}

  async submitKyc(userId: string, dto: SubmitKycDto) {
    // 🔥 Check for active submission
    const existingActiveKyc = await this.kycRepository.findOne({
      where: [
        { userId, status: KycStatus.PENDING },
        { userId, status: KycStatus.UNDER_REVIEW },
      ],
    });

    if (existingActiveKyc) {
      throw new BadRequestException(
        'You already have a KYC submission under review.',
      );
    }

    const newKyc = this.kycRepository.create({
      userId,
      ...dto,
      status: KycStatus.PENDING,
      tier: KycTier.TIER_0,
      submittedAt: new Date(),
    });

    await this.kycRepository.save(newKyc);

    return {
      message: 'KYC submitted successfully',
      status: newKyc.status,
      tier: newKyc.tier,
    };
  }

   async approveKyc(
    id: string,
    approveKycDto: ApproveKycDto,
  ): Promise<KycRecord> {
    const kyc = await this.kycRepository.findOne({ where: { id } });
    if (!kyc) {
      throw new NotFoundException('KYC verification not found');
    }

    if (kyc.status !== KycStatus.PENDING) {
      throw new BadRequestException(
        'KYC verification has already been processed',
      );
    }

    kyc.status = approveKycDto.status;
    if (
      approveKycDto.status === KycStatus.REJECTED &&
      approveKycDto.rejectionReason
    ) {
      kyc.rejectionReason = approveKycDto.rejectionReason;
    }

    return this.kycRepository.save(kyc);
  }


  async getKycStatus(userId: string) {
  const latestKyc = await this.kycRepository.findOne({
    where: { userId },
    order: { createdAt: 'DESC' },
  });

  if (!latestKyc) {
    return {
      status: 'not_submitted',
      tier: 0,
    };
  }

  return {
    status: latestKyc.status,
    tier: latestKyc.tier,
    rejectionReason: latestKyc.rejectionReason,
  };
}


async getPendingKycSubmissions(): Promise<KycRecord[]> {
    return this.kycRepository.find({
      where: { status: KycStatus.PENDING },
      order: { createdAt: 'ASC' },
    });
  }

  async listPendingKyc() {
  return this.kycRepository.find({
    where: { status: KycStatus.PENDING },
    order: { createdAt: 'ASC' },

  });
}


async reviewKyc(
  kycId: string,
  decision: KycStatus,
  reason?: string,
) {
  return this.dataSource.transaction(async (manager) => {
    const kyc = await manager.findOne(KycRecord, {
      where: { id: kycId },
    });

    if (!kyc) {
      throw new BadRequestException('KYC record not found');
    }

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

    const user = await manager.findOne(User, {
      where: { id: kyc.userId },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    let notificationPayload: Partial<Notification>;

    if (decision === KycStatus.APPROVED) {
      kyc.status = KycStatus.APPROVED;
      kyc.tier = 2;
      kyc.reviewedAt = new Date();

      user.isVerified = true;

      notificationPayload = {
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
    tier: 2,
    },
};
    } else {
      kyc.status = KycStatus.REJECTED;
      kyc.rejectionReason = reason || 'KYC rejected';
      kyc.reviewedAt = new Date();

      user.isVerified = false;

      notificationPayload = {
        userId: user.id,
        type: NotificationType.SYSTEM,
        title: 'KYC Rejected',
        message: `Your KYC submission was rejected. Reason: ${kyc.rejectionReason}`,
        status: NotificationStatus.UNREAD,
        relatedId: kyc.id,
    metadata: {
    entity: 'KYC',
    kycStatus: 'rejected',
    reason: kyc.rejectionReason,
    },
    };
    }

    await manager.save(kyc);
    await manager.save(user);
    await manager.save(Notification, notificationPayload);

    return {
      message: `KYC ${decision} successfully`,
    };
  });
}



}