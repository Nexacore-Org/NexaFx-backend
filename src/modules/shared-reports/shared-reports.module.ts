import { Module } from '@nestjs/common';
import { SharedReportsService } from './shared-reports.service';
import { SharedReportsController } from './shared-reports.controller';
import { PublicReportsController } from './public-reports.controller';

@Module({
  controllers: [SharedReportsController, PublicReportsController],
  providers: [SharedReportsService],
  exports: [SharedReportsService],
})
export class SharedReportsModule {}
