import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OcrExtraction, OcrProvider } from './dto/kyc-ocr.dto';
import { MockOcrProvider } from './providers/mock-ocr.provider';
import { GoogleVisionOcrProvider } from './providers/google-vision-ocr.provider';

export interface KycOcrResult extends OcrExtraction {
  kycApplicationId: string;
  provider: string;
  processingTimeMs: number;
  createdAt: Date;
  likelyExpired: boolean;
  documentNumberMismatch: boolean;
}

/**
 * In-memory OCR pre-fill service. Runs extraction inline rather than via a
 * background queue — a small, self-contained scaffold rather than the full
 * async BullMQ pipeline described in the issue.
 */
@Injectable()
export class KycOcrService {
  private results = new Map<string, KycOcrResult>();
  private readonly provider: OcrProvider;

  constructor(
    configService: ConfigService,
    @Inject(MockOcrProvider) private readonly mockProvider: MockOcrProvider,
    @Inject(GoogleVisionOcrProvider)
    private readonly googleProvider: GoogleVisionOcrProvider,
  ) {
    const selected = configService.get<string>('OCR_PROVIDER') ?? 'mock';
    this.provider = selected === 'google' ? this.googleProvider : this.mockProvider;
  }

  async extractForApplication(
    kycApplicationId: string,
    imageKey: string,
    submittedDocumentNumber?: string,
  ): Promise<KycOcrResult> {
    const startedAt = Date.now();
    const extraction = await this.provider.extract(imageKey);

    const likelyExpired = extraction.expiryDate
      ? new Date(extraction.expiryDate) < new Date()
      : false;

    const documentNumberMismatch = Boolean(
      submittedDocumentNumber &&
        extraction.documentNumber &&
        submittedDocumentNumber !== extraction.documentNumber,
    );

    const result: KycOcrResult = {
      ...extraction,
      kycApplicationId,
      provider: this.provider.constructor.name,
      processingTimeMs: Date.now() - startedAt,
      createdAt: new Date(),
      likelyExpired,
      documentNumberMismatch,
    };

    this.results.set(kycApplicationId, result);
    return result;
  }

  getResult(kycApplicationId: string): KycOcrResult {
    const result = this.results.get(kycApplicationId);
    if (!result) {
      throw new NotFoundException(
        `No OCR result for KYC application ${kycApplicationId}`,
      );
    }
    return result;
  }
}
