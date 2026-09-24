import { Module } from '@nestjs/common';
import { CustomReportsController } from './custom-reports.controller';
import { CustomReportsService } from './custom-reports.service';

@Module({
  controllers: [CustomReportsController],
  providers: [CustomReportsService],
  exports: [CustomReportsService],
})
export class CustomReportsModule {}
