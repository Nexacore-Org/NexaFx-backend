import { Module } from '@nestjs/common';
import { IntelligentSmsRoutingController } from './intelligent-sms-routing.controller';
import { IntelligentSmsRoutingService } from './intelligent-sms-routing.service';

@Module({
  controllers: [IntelligentSmsRoutingController],
  providers: [IntelligentSmsRoutingService],
  exports: [IntelligentSmsRoutingService],
})
export class IntelligentSmsRoutingModule {}
