import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit.entity';


@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
  ) {}

  public async logAction(
    userId: string,
    ipAddress: string,
    action: string,
  ): Promise<void> {
    try {
      const audit = this.auditRepo.create({ userId, ipAddress, action });
      await this.auditRepo.save(audit);
    } catch (error) {
      console.error('Failed to log audit action:', error);
    }
  }

  public async findAll(): Promise<AuditLog[]> {
    return this.auditRepo.find({ order: { timestamp: 'DESC' } });
  }
}
