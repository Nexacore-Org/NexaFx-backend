import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebhookVerificationSdkController } from './webhook-verification-sdk.controller';
import { WebhookVerificationSdkService } from './webhook-verification-sdk.service';
import { WebhookVerification } from './entities/webhook-verification.entity';

@Module({
  imports: [TypeOrmModule.forFeature([WebhookVerification])],
  controllers: [WebhookVerificationSdkController],
  providers: [WebhookVerificationSdkService],
  exports: [WebhookVerificationSdkService],
})
export class WebhookVerificationSdkModule {}