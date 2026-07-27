import { Module } from '@nestjs/common';
import { KycOcrService } from './kyc-ocr.service';
import { KycOcrController } from './kyc-ocr.controller';
import { MockOcrProvider } from './providers/mock-ocr.provider';
import { GoogleVisionOcrProvider } from './providers/google-vision-ocr.provider';

@Module({
  controllers: [KycOcrController],
  providers: [KycOcrService, MockOcrProvider, GoogleVisionOcrProvider],
  exports: [KycOcrService],
})
export class KycOcrModule {}
