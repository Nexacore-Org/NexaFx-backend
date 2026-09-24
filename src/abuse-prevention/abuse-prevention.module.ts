import { Module } from '@nestjs/common';
import { AbusePreventionController } from './abuse-prevention.controller';
import { AbusePreventionService } from './abuse-prevention.service';

@Module({
  controllers: [AbusePreventionController],
  providers: [AbusePreventionService],
  exports: [AbusePreventionService],
})
export class AbusePreventionModule {}
