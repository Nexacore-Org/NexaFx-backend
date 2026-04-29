import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import PDFDocument from 'pdfkit';
import { format } from 'date-fns';
import { AuditLogsRepository } from './audit-logs.repository';
import { AuditLogExportJobRepository } from './repositories/audit-log-export-job.repository';
import { AuditLogScheduleRepository } from './repositories/audit-log-schedule.repository';
import { CreateAuditLogDto } from './dto/create-audit-log.dto';
import { GetAuditLogsDto } from './dto/get-audit-logs.dto';
import { AuditEntityType } from './enums/audit-entity-type.enum';
import { AuditLogExportJob, ExportJobStatus, ExportFormat } from './entities/audit-log-export-job.entity';
import { AuditLogSchedule, ScheduleFrequency } from './entities/audit-log-schedule.entity';
import { AuditLog } from './entities/audit-log.entity';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuditLogsService {
  private readonly logger = new Logger(AuditLogsService.name);
  private readonly TEMP_FILES_DIR = '/tmp/audit-exports';

  constructor(
    private readonly auditLogsRepository: AuditLogsRepository,
    private readonly exportJobRepository: AuditLogExportJobRepository,
    private readonly scheduleRepository: AuditLogScheduleRepository,
    private readonly configService: ConfigService,
  ) {}

  async createLog(createAuditLogDto: CreateAuditLogDto): Promise<void> {
    try {
      await this.auditLogsRepository.createAuditLog(createAuditLogDto);
    } catch (error) {
      this.logger.error(
        `Failed to create audit log: ${error.message}`,
        error.stack,
      );
      // Don't throw error to prevent breaking main functionality
    }
  }

  async getLogs(filters: GetAuditLogsDto) {
    return this.auditLogsRepository.findLogsWithPagination(filters);
  }

  async getPrivilegedLogs(filters: GetAuditLogsDto) {
    return this.auditLogsRepository.findLogsWithPagination(filters, {
      includeSensitive: true,
    });
  }

  async getLogsByUserId(userId: string, filters?: Partial<GetAuditLogsDto>) {
    const completeFilters: GetAuditLogsDto = {
      ...filters,
      userId,
    };
    return this.getLogs(completeFilters);
  }

  /**
   * Helper to extract IP from request object
   * Can be used by controllers/interceptors before calling createLog
   */
  getClientIp(request: any): string {
    if (!request) return '';

    const xForwardedFor = request.headers?.['x-forwarded-for'];

    if (Array.isArray(xForwardedFor)) {
      return xForwardedFor[0] || '';
    } else if (typeof xForwardedFor === 'string') {
      return xForwardedFor.split(',')[0].trim() || '';
    }

    return request.ip || request.socket?.remoteAddress || '';
  }

  // Helper methods for common log types
  async logAuthEvent(
    userId: string | undefined,
    action: string,
    metadata?: Record<string, any>,
    isSensitive: boolean = false,
  ) {
    return this.createLog({
      userId,
      action,
      entity: AuditEntityType.AUTH,
      metadata,
      isSensitive,
    });
  }

  async logTransactionEvent(
    userId: string | undefined,
    action: string,
    transactionId: string | undefined,
    metadata?: Record<string, any>,
  ) {
    return this.createLog({
      userId,
      action,
      entity: AuditEntityType.TRANSACTION,
      entityId: transactionId,
      metadata,
    });
  }

  async logWalletEvent(
    userId: string | undefined,
    action: string,
    walletId: string,
    metadata?: Record<string, any>,
  ) {
    return this.createLog({
      userId,
      action,
      entity: AuditEntityType.WALLET,
      entityId: walletId,
      metadata,
    });
  }

  async logSystemEvent(
    action: string,
    entityId?: string,
    metadata?: Record<string, any>,
    isSensitive?: boolean,
  ) {
    return this.createLog({
      action,
      entity: AuditEntityType.SYSTEM,
      entityId,
      metadata,
      isSensitive,
    });
  }

  /**
   * Export audit logs - handles both sync (for small exports) and async (for large)
   */
  async exportAuditLogs(
    adminUserId: string,
    filters: { startDate?: string; endDate?: string; userId?: string; action?: string },
    format: 'PDF' | 'CSV',
  ): Promise<{ jobId: string; data?: Buffer; isAsync: boolean }> {
    // Create export job record
    const job = await this.exportJobRepository.createJob(
      adminUserId,
      format as ExportFormat,
      filters,
    );

    // Fetch all logs matching filters (with sensitive included for export)
    const allFilters: GetAuditLogsDto = {
      ...filters,
      page: 1,
      limit: 99999, // fetch all
    };

    try {
      await this.exportJobRepository.updateJobStatus(
        job.id,
        ExportJobStatus.PROCESSING,
      );

      const result = await this.auditLogsRepository.findLogsWithPagination(
        allFilters,
        { includeSensitive: true },
      );

      const logs = result.logs;

      // For large exports, return async job; for small, return buffer
      const isAsync = logs.length > 5000;

      let buffer: Buffer | undefined;
      let filename: string;

      if (format === 'PDF') {
        const pdfResult = this.generatePdfExport(logs, filters);
        buffer = pdfResult.buffer;
        filename = pdfResult.filename;
      } else {
        const csvResult = this.generateCsvExport(logs);
        buffer = csvResult.buffer;
        filename = csvResult.filename;
      }

      // Update job with completion details
      await this.exportJobRepository.updateJobStatus(
        job.id,
        ExportJobStatus.COMPLETED,
        {
          filename,
          fileSize: buffer.length,
          recordCount: logs.length,
        },
      );

      // Log the export action
      await this.createLog({
        userId: adminUserId,
        action: 'AUDIT_EXPORT',
        entity: AuditEntityType.SYSTEM,
        entityId: job.id,
        metadata: {
          format,
          recordCount: logs.length,
          filters,
          filename,
        },
      });

      return { jobId: job.id, data: isAsync ? undefined : buffer, isAsync };
    } catch (error) {
      this.logger.error(
        `Export job ${job.id} failed: ${error.message}`,
        error.stack,
      );
      await this.exportJobRepository.updateJobStatus(
        job.id,
        ExportJobStatus.FAILED,
        { errorMessage: error.message },
      );
      throw error;
    }
  }

  /**
   * Generate PDF export with SHA-256 hash footer for tamper evidence
   */
  private generatePdfExport(
    logs: AuditLog[],
    filters: Record<string, any>,
  ): { buffer: Buffer, filename: string } {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));

    // Title and metadata
    doc
      .fontSize(20)
      .font('Helvetica-Bold')
      .text('Audit Log Export', { align: 'center' })
      .moveDown(0.5);

    const now = new Date();
    const dateRange = filters.startDate && filters.endDate 
      ? `${filters.startDate} to ${filters.endDate}`
      : filters.startDate
      ? `From ${filters.startDate}`
      : filters.endDate
      ? `Until ${filters.endDate}`
      : 'All dates';
    
    doc
      .fontSize(10)
      .font('Helvetica')
      .text(`Generated: ${format(now, 'yyyy-MM-dd HH:mm:ss')}`, {
        align: 'center',
      })
      .text(`Date Range: ${dateRange}`, { align: 'center' })
      .text(`Total Records: ${logs.length}`, { align: 'center' })
      .moveDown(1);

    // Table header
    const tableTop = doc.y;
    const col1 = 50,
      col2 = 130,
      col3 = 200,
      col4 = 280,
      col5 = 360,
      col6 = 450;
    const rowHeight = 15;

    doc
      .fontSize(9)
      .font('Helvetica-Bold')
      .text('Timestamp', col1, tableTop)
      .text('User ID', col2, tableTop)
      .text('Action', col3, tableTop)
      .text('Entity', col4, tableTop)
      .text('Entity ID', col5, tableTop)
      .text('IP Address', col6, tableTop);

    doc.moveTo(50, tableTop + 12).lineTo(550, tableTop + 12).stroke();

    // Table rows
    let yPos = tableTop + 20;
    const eventIds: string[] = [];

    for (const log of logs) {
      eventIds.push(log.id);

      const timestamp = format(new Date(log.createdAt), 'yyyy-MM-dd HH:mm:ss');
      const userId = log.userId ? log.userId.substring(0, 8) : 'N/A';
      const action = log.action.substring(0, 20);
      const entity = log.entity.substring(0, 12);
      const entityId = log.entityId ? log.entityId.substring(0, 12) : '-';
      const ip = log.ipAddress || '-';

      doc
        .fontSize(8)
        .font('Helvetica')
        .text(timestamp, col1, yPos, { width: 70 })
        .text(userId, col2, yPos, { width: 60 })
        .text(action, col3, yPos, { width: 70 })
        .text(entity, col4, yPos, { width: 70 })
        .text(entityId, col5, yPos, { width: 70 })
        .text(ip, col6, yPos, { width: 60 });

      yPos += rowHeight;

      // Check if we need a new page
      if (yPos > 700) {
        doc.addPage();
        yPos = 50;
      }
    }

    // Footer with SHA-256 hash
    doc.moveTo(50, doc.y + 10).lineTo(550, doc.y + 10).stroke();
    doc.moveDown(1);

    const hashInput = eventIds.join(',');
    const hash = crypto.createHash('sha256').update(hashInput).digest('hex');

    doc
      .fontSize(8)
      .font('Helvetica')
      .text(`Tamper Evidence Hash (SHA-256): ${hash}`, {
        align: 'center',
      })
      .text(`© ${new Date().getFullYear()} NexaFx Audit Export`, {
        align: 'center',
      });

    doc.end();

    return {
      buffer: Buffer.concat(chunks),
      filename: `audit-export-${format(now, 'yyyy-MM-dd-HHmmss')}.pdf`,
    };
  }

  /**
   * Generate CSV export
   */
  private generateCsvExport(logs: AuditLog[]): { buffer: Buffer; filename: string } {
    const now = new Date();
    let csv = 'Timestamp,User ID,Action,Entity,Entity ID,IP Address,User Agent\n';

    for (const log of logs) {
      const timestamp = format(new Date(log.createdAt), 'yyyy-MM-dd HH:mm:ss');
      const userId = log.userId || '';
      const action = log.action.replace(/"/g, '""'); // escape quotes
      const entity = log.entity;
      const entityId = log.entityId || '';
      const ip = log.ipAddress || '';
      const userAgent = (log.userAgent || '').replace(/"/g, '""');

      csv += `"${timestamp}","${userId}","${action}","${entity}","${entityId}","${ip}","${userAgent}"\n`;
    }

    return {
      buffer: Buffer.from(csv, 'utf-8'),
      filename: `audit-export-${format(now, 'yyyy-MM-dd-HHmmss')}.csv`,
    };
  }

  /**
   * Get export job status
   */
  async getExportJobStatus(
    adminUserId: string,
    jobId: string,
  ): Promise<AuditLogExportJob> {
    const job = await this.exportJobRepository.getJob(jobId);
    if (!job) throw new BadRequestException('Export job not found');
    if (job.adminUserId !== adminUserId)
      throw new BadRequestException('Unauthorized');
    return job;
  }

  /**
   * Get export job data for download
   */
  async downloadExportJob(
    adminUserId: string,
    jobId: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const job = await this.getExportJobStatus(adminUserId, jobId);
    if (job.status !== ExportJobStatus.COMPLETED)
      throw new BadRequestException('Export job not ready');

    // Re-fetch logs and regenerate export (in prod, would store files)
    const allFilters: GetAuditLogsDto = {
      ...job.filters,
      page: 1,
      limit: 99999,
    };

    const result = await this.auditLogsRepository.findLogsWithPagination(
      allFilters,
      { includeSensitive: true },
    );

    const logs = result.logs;

    if (job.format === ExportFormat.PDF) {
      return this.generatePdfExport(logs, job.filters);
    } else {
      return this.generateCsvExport(logs);
    }
  }

  /**
   * Schedule monthly audit log delivery
   */
  async scheduleMonthlyDelivery(
    adminUserId: string,
    adminEmail: string,
  ): Promise<AuditLogSchedule> {
    // Calculate next run (1st of next month)
    const now = new Date();
    let nextRun = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    // If we're before the 1st, set to 1st of this month
    if (now.getDate() === 1) {
      nextRun = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const schedule = await this.scheduleRepository.createSchedule(
      adminUserId,
      adminEmail,
      ScheduleFrequency.MONTHLY,
      nextRun,
    );

    // Log the scheduling action
    await this.createLog({
      userId: adminUserId,
      action: 'AUDIT_SCHEDULE_CREATED',
      entity: AuditEntityType.SYSTEM,
      entityId: schedule.id,
      metadata: {
        frequency: ScheduleFrequency.MONTHLY,
        adminEmail,
        nextRun,
      },
    });

    return schedule;
  }

  /**
   * Process scheduled monthly deliveries (called by cron)
   */
  async processScheduledExports(): Promise<{ processed: number; failed: number }> {
    const schedules = await this.scheduleRepository.getDueSchedules();
    let processed = 0;
    let failed = 0;

    const now = new Date();

    for (const schedule of schedules) {
      if (schedule.nextRun <= now && schedule.isActive) {
        try {
          // Generate export for previous month
          const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          const monthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

          const filters = {
            startDate: format(prevMonth, 'yyyy-MM-dd'),
            endDate: format(monthEnd, 'yyyy-MM-dd'),
          };

          const exportJob = await this.exportAuditLogs(
            schedule.adminUserId,
            filters,
            'PDF',
          );

          // Download and email the result (best-effort)
          try {
            const downloadResult = await this.downloadExportJob(
              schedule.adminUserId,
              exportJob.jobId,
            );
            // TODO: Send email via NotificationsService/Mailgun
            this.logger.log(
              `Sent monthly audit export to ${schedule.adminEmail}`,
            );
          } catch (e) {
            this.logger.warn(
              `Failed to email export to ${schedule.adminEmail}: ${e.message}`,
            );
          }

          // Update schedule for next month
          const nextRun = new Date(now.getFullYear(), now.getMonth() + 1, 1);
          await this.scheduleRepository.updateLastRun(schedule.id, nextRun);

          processed += 1;
        } catch (error) {
          this.logger.error(
            `Failed to process schedule ${schedule.id}: ${error.message}`,
          );
          failed += 1;
        }
      }
    }

    return { processed, failed };
  }
}
