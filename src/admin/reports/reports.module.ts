import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ReportSchedule } from './report-schedule.entity';
import { ReportJob } from './report-job.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ReportSchedule, ReportJob])],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
