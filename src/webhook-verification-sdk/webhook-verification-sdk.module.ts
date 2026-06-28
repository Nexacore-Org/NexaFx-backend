import { Module } from '@nestjs/common';
import { WebhookVerificationSdkController } from './webhook-verification-sdk.controller';
import { WebhookVerificationSdkService } from './webhook-verification-sdk.service';

@Module({
  controllers: [WebhookVerificationSdkController],
  providers: [WebhookVerificationSdkService],
  exports: [WebhookVerificationSdkService],
})
export class WebhookVerificationSdkModule {}
