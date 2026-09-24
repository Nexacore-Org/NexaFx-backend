import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomReportsController } from './custom-reports.controller';
import { CustomReportsService } from './custom-reports.service';
import { CustomReportDefinition } from './entities/custom-report-definition.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CustomReportDefinition])],
  controllers: [CustomReportsController],
  providers: [CustomReportsService],
  exports: [CustomReportsService],
})
export class CustomReportsModule {}
