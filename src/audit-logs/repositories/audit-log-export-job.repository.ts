import { Injectable, Logger } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { AuditLogExportJob, ExportJobStatus, ExportFormat } from './entities/audit-log-export-job.entity';

@Injectable()
export class AuditLogExportJobRepository extends Repository<AuditLogExportJob> {
  private readonly logger = new Logger(AuditLogExportJobRepository.name);

  constructor(private dataSource: DataSource) {
    super(AuditLogExportJob, dataSource.createEntityManager());
  }

  async createJob(
    adminUserId: string,
    format: ExportFormat,
    filters: Record<string, any>,
  ): Promise<AuditLogExportJob> {
    const job = this.create({
      adminUserId,
      format,
      filters,
      status: ExportJobStatus.PENDING,
      recordCount: 0,
    });
    return this.save(job);
  }

  async updateJobStatus(
    jobId: string,
    status: ExportJobStatus,
    data?: Partial<AuditLogExportJob>,
  ): Promise<AuditLogExportJob> {
    await this.update(jobId, {
      status,
      ...data,
      ...(status === ExportJobStatus.COMPLETED && { completedAt: new Date() }),
    });
    return this.findOne({ where: { id: jobId } }) as Promise<AuditLogExportJob>;
  }

  async getJob(jobId: string): Promise<AuditLogExportJob | null> {
    return this.findOne({ where: { id: jobId } });
  }
}
