import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiKycDocVerificationController } from './ai-kyc-doc-verification.controller';
import { AiKycDocVerificationService } from './ai-kyc-doc-verification.service';
import { KycDocVerificationResult } from './entities/kyc-doc-verification-result.entity';
import { KYCApplication } from '../kyc/entities/kyc-application.entity';
import { KycModule } from '../kyc/kyc.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([KycDocVerificationResult, KYCApplication]),
    KycModule,
  ],
  controllers: [AiKycDocVerificationController],
  providers: [AiKycDocVerificationService],
  exports: [AiKycDocVerificationService],
})
export class AiKycDocVerificationModule {}
