import { Injectable, Logger } from '@nestjs/common';
import { DataSource, Repository, Between, Like } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { CreateAuditLogDto } from './dto/create-audit-log.dto';
import { GetAuditLogsDto } from './dto/get-audit-logs.dto';

@Injectable()
export class AuditLogsRepository extends Repository<AuditLog> {
  private readonly logger = new Logger(AuditLogsRepository.name);

  constructor(private dataSource: DataSource) {
    super(AuditLog, dataSource.createEntityManager());
  }

  async createAuditLog(createAuditLogDto: CreateAuditLogDto): Promise<AuditLog> {
    try {
      const auditLog = this.create(createAuditLogDto);
      const savedLog = await this.save(auditLog);
      
      // Prevent logging sensitive data in the general log
      if (!createAuditLogDto.isSensitive) {
        this.logger.debug(`Audit log created: ${savedLog.action} for ${savedLog.entity}`);
      }
      
      return savedLog;
    } catch (error) {
      this.logger.error(`Failed to create audit log: ${error.message}`, error.stack);
      throw error;
    }
  }

  async findLogsWithPagination(filters: GetAuditLogsDto) {
    const {
      entity,
      userId,
      action,
      startDate,
      endDate,
      page = 1,
      limit = 20,
    } = filters;

    const skip = (page - 1) * limit;

    const query = this.createQueryBuilder('audit_log')
      .orderBy('audit_log.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (entity) {
      query.andWhere('audit_log.entity = :entity', { entity });
    }

    if (userId) {
      query.andWhere('audit_log.userId = :userId', { userId });
    }

    if (action) {
      query.andWhere('audit_log.action LIKE :action', { action: `%${action}%` });
    }

    if (startDate && endDate) {
      query.andWhere({
        createdAt: Between(new Date(startDate), new Date(endDate)),
      });
    } else if (startDate) {
      query.andWhere('audit_log.createdAt >= :startDate', { startDate: new Date(startDate) });
    } else if (endDate) {
      query.andWhere('audit_log.createdAt <= :endDate', { endDate: new Date(endDate) });
    }

    // Exclude sensitive logs from general queries
    query.andWhere('audit_log.isSensitive = :isSensitive', { isSensitive: false });

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
      where: { userId, isSensitive: true },
      order: { createdAt: 'DESC' },
    });
  }
}