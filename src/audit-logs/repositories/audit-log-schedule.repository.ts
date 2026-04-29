import { Injectable, Logger } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { AuditLogSchedule, ScheduleFrequency } from './entities/audit-log-schedule.entity';

@Injectable()
export class AuditLogScheduleRepository extends Repository<AuditLogSchedule> {
  private readonly logger = new Logger(AuditLogScheduleRepository.name);

  constructor(private dataSource: DataSource) {
    super(AuditLogSchedule, dataSource.createEntityManager());
  }

  async createSchedule(
    adminUserId: string,
    adminEmail: string,
    frequency: ScheduleFrequency,
    nextRun: Date,
  ): Promise<AuditLogSchedule> {
    const schedule = this.create({
      adminUserId,
      adminEmail,
      frequency,
      nextRun,
      isActive: true,
    });
    return this.save(schedule);
  }

  async getDueSchedules(): Promise<AuditLogSchedule[]> {
    return this.find({
      where: {
        isActive: true,
      },
      order: { nextRun: 'ASC' },
    });
  }

  async updateLastRun(scheduleId: string, nextRun: Date): Promise<void> {
    await this.update(scheduleId, {
      lastRun: new Date(),
      nextRun,
    });
  }
}
