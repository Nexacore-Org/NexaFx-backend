import { Module } from '@nestjs/common';
import { MerchantIntegrationController } from './merchant-integration.controller';
import { MerchantIntegrationService } from './merchant-integration.service';

@Module({
  controllers: [MerchantIntegrationController],
  providers: [MerchantIntegrationService],
  exports: [MerchantIntegrationService],
})
export class MerchantIntegrationModule {}
