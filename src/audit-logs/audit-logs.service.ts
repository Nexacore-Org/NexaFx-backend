import { Injectable, Logger, Inject } from '@nestjs/common';
import { AuditLogsRepository } from './audit-logs.repository';
import { CreateAuditLogDto } from './dto/create-audit-log.dto';
import { GetAuditLogsDto } from './dto/get-audit-logs.dto';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';
import { AuditEntityType } from './enums/audit-entity-type.enum';

@Injectable()
export class AuditLogsService {
  private readonly logger = new Logger(AuditLogsService.name);

  constructor(
    private readonly auditLogsRepository: AuditLogsRepository,
    @Inject(REQUEST) private readonly request: Request,
  ) {}

  async createLog(
    createAuditLogDto: Omit<CreateAuditLogDto, 'ipAddress' | 'userAgent'>,
  ): Promise<void> {
    try {
      // Extract IP and User Agent from request if available
      const ipAddress = this.getClientIp();
      const userAgent = this.request.headers['user-agent'];

      const logDto: CreateAuditLogDto = {
        ...createAuditLogDto,
        ipAddress,
        userAgent,
      };

      await this.auditLogsRepository.createAuditLog(logDto);
    } catch (error) {
      this.logger.error(`Failed to create audit log: ${error.message}`, error.stack);
      // Don't throw error to prevent breaking main functionality
    }
  }

  async getLogs(filters: GetAuditLogsDto) {
    return this.auditLogsRepository.findLogsWithPagination(filters);
  }

  async getLogsByUserId(userId: string, filters?: Partial<GetAuditLogsDto>) {
    const completeFilters: GetAuditLogsDto = {
      ...filters,
      userId,
    };
    return this.getLogs(completeFilters);
  }


  private getClientIp(): string {
    const request = this.request;
    const xForwardedFor = request.headers['x-forwarded-for'];
    
    if (Array.isArray(xForwardedFor)) {
      return xForwardedFor[0] || '';
    } else if (typeof xForwardedFor === 'string') {
      return xForwardedFor.split(',')[0].trim() || '';
    }
    
    return request.ip || request.socket.remoteAddress || '';
  }

  // Helper methods for common log types
  async logAuthEvent(
    userId: string | undefined,
    action: string,
    metadata?: Record<string, any>,
    isSensitive: boolean  = false,
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
    isSensitive?: boolean
  ) {
    return this.createLog({
      action,
      entity: AuditEntityType.SYSTEM,
      entityId,
      metadata,
      isSensitive
    });
  }
}