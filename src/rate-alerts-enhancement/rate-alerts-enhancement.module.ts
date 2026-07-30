import { Module } from '@nestjs/common';
import { RateAlertsEnhancementController } from './rate-alerts-enhancement.controller';
import { RateAlertsEnhancementService } from './rate-alerts-enhancement.service';

@Module({
  controllers: [RateAlertsEnhancementController],
  providers: [RateAlertsEnhancementService],
  exports: [RateAlertsEnhancementService],
})
export class RateAlertsEnhancementModule {}
