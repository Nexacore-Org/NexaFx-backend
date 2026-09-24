import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { HealthReport } from './entities/health-report.entity';
import { HealthReportService } from './health-report.service';
import { HealthReportController } from './health-report.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([HealthReport]),
    ScheduleModule,
  ],
  controllers: [HealthReportController],
  providers: [HealthReportService],
  exports: [HealthReportService],
})
export class HealthReportModule {}
