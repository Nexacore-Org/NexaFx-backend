import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { OcrExtraction, OcrProvider } from '../dto/kyc-ocr.dto';

/**
 * Google Cloud Vision (Document Text Detection) OCR provider.
 * Credentials come from GOOGLE_VISION_API_KEY only — never hardcoded.
 */
@Injectable()
export class GoogleVisionOcrProvider implements OcrProvider {
  private readonly logger = new Logger(GoogleVisionOcrProvider.name);

  constructor(private readonly configService: ConfigService) {}

  async extract(imageKey: string): Promise<OcrExtraction> {
    const apiKey = this.configService.get<string>('GOOGLE_VISION_API_KEY');
    if (!apiKey) {
      this.logger.warn('GOOGLE_VISION_API_KEY not configured — skipping OCR extraction');
      return { confidence: 0 };
    }

    const response = await axios.post(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        requests: [
          {
            image: { source: { imageUri: imageKey } },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
          },
        ],
      },
    );

    const text: string =
      response.data?.responses?.[0]?.fullTextAnnotation?.text ?? '';

    return this.parseText(text);
  }

  /** Naive field extraction from raw OCR text — a real implementation would use per-document-type layout templates. */
  private parseText(text: string): OcrExtraction {
    const documentNumberMatch = text.match(/\b[A-Z0-9]{6,12}\b/);
    const dobMatch = text.match(/\b\d{4}-\d{2}-\d{2}\b/);

    return {
      documentNumber: documentNumberMatch?.[0],
      dateOfBirth: dobMatch?.[0],
      confidence: text ? 60 : 0,
    };
  }
}
