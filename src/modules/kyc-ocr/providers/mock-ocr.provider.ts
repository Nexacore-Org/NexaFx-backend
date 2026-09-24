import { Injectable } from '@nestjs/common';
import { OcrExtraction, OcrProvider } from '../dto/kyc-ocr.dto';

/** Fixed-data OCR provider used for test/dev — never calls a real OCR API. */
@Injectable()
export class MockOcrProvider implements OcrProvider {
  async extract(_imageKey: string): Promise<OcrExtraction> {
    return {
      fullName: 'Jane Doe',
      documentNumber: 'AB123456',
      dateOfBirth: '1990-01-01',
      expiryDate: '2030-01-01',
      nationality: 'NG',
      confidence: 92,
    };
  }
}
