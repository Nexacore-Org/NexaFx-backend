import { Module } from '@nestjs/common';
import { AiKycDocVerificationController } from './ai-kyc-doc-verification.controller';
import { AiKycDocVerificationService } from './ai-kyc-doc-verification.service';

@Module({
  controllers: [AiKycDocVerificationController],
  providers: [AiKycDocVerificationService],
  exports: [AiKycDocVerificationService],
})
export class AiKycDocVerificationModule {}
