import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KycVerification, KycStatus } from './entities/kyc.entity';
import { SubmitKycDto } from './dto/submit-kyc.dto';
import { ApproveKycDto } from './dto/approve-kyc.dto';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class KycService {
  constructor(
    @InjectRepository(KycVerification)
    private kycRepository: Repository<KycVerification>,
    private configService: ConfigService,
  ) {}

  async submitKyc(
    userId: string,
    submitKycDto: SubmitKycDto,
  ): Promise<KycVerification> {
    // Check if user already has a KYC submission
    const existingKyc = await this.kycRepository.findOne({ where: { userId } });
    if (existingKyc) {
      throw new BadRequestException('KYC verification already submitted');
    }

    // TODO: Implement image upload to cloud storage (S3/Cloudinary)
    // For now, we'll store the image URL directly
    const selfieUrl = submitKycDto.selfieImage;

    const kyc = this.kycRepository.create({
      ...submitKycDto,
      selfieUrl,
      userId,
      status: KycStatus.PENDING,
    });

    return this.kycRepository.save(kyc);
  }

  async approveKyc(
    id: string,
    approveKycDto: ApproveKycDto,
  ): Promise<KycVerification> {
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

  async getKycStatus(userId: string): Promise<KycVerification> {
    const kyc = await this.kycRepository.findOne({ where: { userId } });
    if (!kyc) {
      throw new NotFoundException('KYC verification not found');
    }
    return kyc;
  }

  async getPendingKycSubmissions(): Promise<KycVerification[]> {
    return this.kycRepository.find({
      where: { status: KycStatus.PENDING },
      order: { createdAt: 'ASC' },
    });
  }
}
