import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogsController } from './audit-logs.controller';
import { AuditLogsService } from './audit-logs.service';
import { AuditLogsRepository } from './audit-logs.repository';
import { AuditLogExportJobRepository } from './repositories/audit-log-export-job.repository';
import { AuditLogScheduleRepository } from './repositories/audit-log-schedule.repository';
import { AuditLog } from './entities/audit-log.entity';
import { AuditLogExportJob } from './entities/audit-log-export-job.entity';
import { AuditLogSchedule } from './entities/audit-log-schedule.entity';

@Global() // Make this module global so services can inject it everywhere
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog, AuditLogExportJob, AuditLogSchedule])],
  controllers: [AuditLogsController],
  providers: [AuditLogsService, AuditLogsRepository, AuditLogExportJobRepository, AuditLogScheduleRepository],
  exports: [AuditLogsService],
})
export class AuditLogsModule {}
