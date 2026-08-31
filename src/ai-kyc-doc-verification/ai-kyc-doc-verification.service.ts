import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KycDocVerificationResult, KycVerificationDecision } from './entities/kyc-doc-verification-result.entity';
import { KYCApplication, KycStatus } from '../kyc/entities/kyc-application.entity';
import { KycService } from '../kyc/kyc.service';
import { User } from '../users/user.entity';

@Injectable()
export class AiKycDocVerificationService {
  private readonly logger = new Logger(AiKycDocVerificationService.name);

  constructor(
    @InjectRepository(KycDocVerificationResult)
    private readonly verificationResultRepository: Repository<KycDocVerificationResult>,
    @InjectRepository(KYCApplication)
    private readonly kycRepository: Repository<KYCApplication>,
    private readonly kycService: KycService,
  ) {}

  /**
   * Run automated AI KYC document check and verify information against the user profile.
   */
  async verifyApplication(
    kycApplicationId: string,
    simulatedOcr?: {
      documentType: string;
      confidenceScore: number;
      faceMatchScore: number;
      extractedFields: {
        firstName?: string;
        lastName?: string;
        dateOfBirth?: string;
        expiryDate?: string;
        documentNumber?: string;
      };
    },
  ): Promise<KycDocVerificationResult> {
    const kyc = await this.kycRepository.findOne({
      where: { id: kycApplicationId },
      relations: ['user'],
    });

    if (!kyc) {
      throw new NotFoundException('KYC application not found');
    }

    if (kyc.status !== KycStatus.PENDING) {
      throw new BadRequestException('KYC application has already been processed');
    }

    // Default simulation data if not provided (mocking a successful match)
    const ocr = simulatedOcr ?? {
      documentType: 'PASSPORT',
      confidenceScore: 0.95,
      faceMatchScore: 0.92,
      extractedFields: {
        firstName: kyc.user.firstName,
        lastName: kyc.user.lastName,
        dateOfBirth: (kyc.user as any).dateOfBirth ? (kyc.user as any).dateOfBirth.toISOString().split('T')[0] : '1990-01-01',
        expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 1 year in future
        documentNumber: 'P12345678',
      },
    };

    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Verify Expiry Date
    if (ocr.extractedFields.expiryDate) {
      const expiry = new Date(ocr.extractedFields.expiryDate);
      if (expiry.getTime() < Date.now()) {
        errors.push('Document is expired');
      }
    } else {
      errors.push('Expiry date is missing from document');
    }

    // 2. Name Matching
    const userFirstName = (kyc.user.firstName || '').toLowerCase().trim();
    const userLastName = (kyc.user.lastName || '').toLowerCase().trim();
    const ocrFirstName = (ocr.extractedFields.firstName || '').toLowerCase().trim();
    const ocrLastName = (ocr.extractedFields.lastName || '').toLowerCase().trim();

    if (!ocrFirstName || !ocrLastName) {
      errors.push('Extracted names are incomplete');
    } else if (userFirstName !== ocrFirstName || userLastName !== ocrLastName) {
      // Check if there is a partial match or typo
      const isFirstNamePartial = ocrFirstName.includes(userFirstName) || userFirstName.includes(ocrFirstName);
      const isLastNamePartial = ocrLastName.includes(userLastName) || userLastName.includes(ocrLastName);

      if (isFirstNamePartial && isLastNamePartial) {
        warnings.push('Name spelling discrepancy (partial match)');
      } else {
        errors.push(`Name mismatch: Profile "${kyc.user.firstName} ${kyc.user.lastName}" vs Document "${ocr.extractedFields.firstName} ${ocr.extractedFields.lastName}"`);
      }
    }

    // 3. Face match score check
    if (ocr.faceMatchScore < 0.70) {
      errors.push(`Face match score is too low (${ocr.faceMatchScore})`);
    } else if (ocr.faceMatchScore < 0.85) {
      warnings.push(`Borderline face match score (${ocr.faceMatchScore})`);
    }

    // 4. OCR confidence score check
    if (ocr.confidenceScore < 0.75) {
      errors.push(`Document reading confidence is too low (${ocr.confidenceScore})`);
    } else if (ocr.confidenceScore < 0.88) {
      warnings.push(`Borderline reading confidence score (${ocr.confidenceScore})`);
    }

    // Determine decision
    let decision: KycVerificationDecision = KycVerificationDecision.PASS;
    let reason: string | null = null;

    if (errors.length > 0) {
      decision = KycVerificationDecision.FAIL;
      reason = errors.join('; ');
    } else if (warnings.length > 0) {
      decision = KycVerificationDecision.REVIEW;
      reason = warnings.join('; ');
    }

    // Create and save result
    const verificationResult = this.verificationResultRepository.create({
      kycApplicationId: kyc.id,
      documentType: ocr.documentType,
      confidenceScore: ocr.confidenceScore,
      faceMatchScore: ocr.faceMatchScore,
      decision,
      reason,
      extractedFields: ocr.extractedFields as any,
    });

    const savedResult = await this.verificationResultRepository.save(verificationResult);

    // Apply auto decisions
    if (decision === KycVerificationDecision.PASS) {
      await this.kycService.approveKyc(kyc.id, 'SYSTEM_AI');
    } else if (decision === KycVerificationDecision.FAIL) {
      await this.kycService.rejectKyc(kyc.id, 'SYSTEM_AI', reason || 'AI verification failed', true);
    }

    return savedResult;
  }
}
