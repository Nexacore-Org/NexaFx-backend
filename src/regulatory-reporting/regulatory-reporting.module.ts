import { Module } from '@nestjs/common';
import { RegulatoryReportingController } from './regulatory-reporting.controller';
import { RegulatoryReportingService } from './regulatory-reporting.service';

@Module({
  controllers: [RegulatoryReportingController],
  providers: [RegulatoryReportingService],
  exports: [RegulatoryReportingService],
})
export class RegulatoryReportingModule {}
