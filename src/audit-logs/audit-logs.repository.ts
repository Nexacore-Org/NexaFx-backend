import { Injectable, Logger } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { CreateAuditLogDto } from './dto/create-audit-log.dto';
import { GetAuditLogsDto } from './dto/get-audit-logs.dto';

@Injectable()
export class AuditLogsRepository extends Repository<AuditLog> {
  private readonly logger = new Logger(AuditLogsRepository.name);

  constructor(private dataSource: DataSource) {
    super(AuditLog, dataSource.createEntityManager());
  }

  async createAuditLog(
    createAuditLogDto: CreateAuditLogDto,
  ): Promise<AuditLog> {
    try {
      const auditLog = this.create({
        ...createAuditLogDto,
        actorId: createAuditLogDto.actorId || createAuditLogDto.userId,
        resourceType: createAuditLogDto.resourceType || createAuditLogDto.entity,
        resourceId: createAuditLogDto.resourceId || createAuditLogDto.entityId,
        status: createAuditLogDto.status as any,
      });
      const savedLog = await this.save(auditLog);

      // Prevent logging sensitive data in the general log
      if (!createAuditLogDto.isSensitive) {
        this.logger.debug(
          `Audit log created: ${savedLog.action} for ${savedLog.resourceType}`,
        );
      }

      return savedLog;
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to create audit log: ${err.message}`,
        err.stack,
      );
      throw err;
    }
  }

  async findLogsWithPagination(
    filters: GetAuditLogsDto & {
      actorId?: string;
      from?: string;
      to?: string;
      status?: string;
      resourceType?: string;
    },
    options?: { includeSensitive?: boolean },
  ) {
    const {
      entity,
      resourceType,
      userId,
      actorId,
      action,
      startDate,
      from,
      endDate,
      to,
      status,
      page = 1,
      limit = 20,
    } = filters;

    const skip = (page - 1) * limit;

    const query = this.createQueryBuilder('audit_log')
      .orderBy('audit_log.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    const typeFilter = resourceType || entity;
    if (typeFilter) {
      query.andWhere('audit_log.resourceType = :resourceType', { resourceType: typeFilter });
    }

    const userFilter = actorId || userId;
    if (userFilter) {
      query.andWhere('audit_log.actorId = :actorId', { actorId: userFilter });
    }

    if (action) {
      query.andWhere('audit_log.action = :action', { action });
    }

    if (status) {
      query.andWhere('audit_log.status = :status', { status });
    }

    const start = from || startDate;
    const end = to || endDate;

    if (start && end) {
      query.andWhere('audit_log.createdAt BETWEEN :start AND :end', {
        start: new Date(start),
        end: new Date(end),
      });
    } else if (start) {
      query.andWhere('audit_log.createdAt >= :start', {
        start: new Date(start),
      });
    } else if (end) {
      query.andWhere('audit_log.createdAt <= :end', {
        end: new Date(end),
      });
    }

    if (!options?.includeSensitive) {
      query.andWhere('audit_log.isSensitive = :isSensitive', {
        isSensitive: false,
      });
    }

    const [logs, total] = await query.getManyAndCount();

    return {
      logs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findSensitiveLogs(userId: string) {
    return this.find({
      where: { actorId: userId, isSensitive: true },
      order: { createdAt: 'DESC' },
    });
  }
}
