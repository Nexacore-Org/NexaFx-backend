import { Module } from '@nestjs/common';
import { MerchantAnalyticsService } from './merchant-analytics.service';
import { MerchantAnalyticsController } from './merchant-analytics.controller';

@Module({
  controllers: [MerchantAnalyticsController],
  providers: [MerchantAnalyticsService],
  exports: [MerchantAnalyticsService],
})
export class MerchantAnalyticsModule {}
