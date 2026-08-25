import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IndexAdvisoryReport } from './entities/index-advisory-report.entity';
import { IndexAdvisorService } from './index-advisor.service';
import { IndexAdvisorCronService } from './index-advisor-cron.service';
import { DbAdvisoryController } from './db-advisory.controller';
import { NotificationsModule } from '../../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([IndexAdvisoryReport]),
    NotificationsModule,
  ],
  controllers: [DbAdvisoryController],
  providers: [IndexAdvisorService, IndexAdvisorCronService],
  exports: [IndexAdvisorService],
})
export class DbAdvisoryModule {}
