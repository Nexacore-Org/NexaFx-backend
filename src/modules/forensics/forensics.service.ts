import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, IsNull } from 'typeorm';
import * as crypto from 'crypto';
import { AuditLog } from '../audit/entities/audit-log.entity';

@Injectable()
export class ForensicsService {
  private readonly logger = new Logger(ForensicsService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepo: Repository<AuditLog>,
  ) {}

  async verifyChain(fromDate?: string, toDate?: string) {
    const logs = await this.fetchLogs(fromDate, toDate);

    let verified = true;
    let firstBrokenAt: string | null = null;
    let previousHash: string | null = null;
    let totalChecked = 0;

    for (const log of logs) {
      totalChecked++;

      const computedHash = this.computeSelfHash(log);

      if (log.selfHash && log.selfHash !== computedHash) {
        verified = false;
        if (!firstBrokenAt) {
          firstBrokenAt = log.id;
        }
      }

      if (log.previousHash !== previousHash) {
        verified = false;
        if (!firstBrokenAt) {
          firstBrokenAt = log.id;
        }
      }

      previousHash = computedHash;
    }

    return {
      verified,
      totalChecked,
      firstBrokenAt,
    };
  }

  async generateManifest(fromDate?: string, toDate?: string) {
    const logs = await this.fetchLogs(fromDate, toDate);

    const hashes: string[] = [];
    let previousHash: string | null = null;

    for (const log of logs) {
      const selfHash = log.selfHash ?? this.computeSelfHash(log);
      hashes.push(selfHash);

      if (log.previousHash !== previousHash) {
        this.logger.warn(
          `Chain break detected at log ${log.id}: expected previousHash ${previousHash}, got ${log.previousHash}`,
        );
      }

      previousHash = selfHash;
    }

    const payload = JSON.stringify({ hashes, generatedAt: new Date().toISOString() });
    const signature = crypto
      .createHash('sha256')
      .update(payload)
      .digest('hex');

    const manifestId = crypto.randomUUID();

    return {
      manifestId,
      hashes,
      signature,
    };
  }

  async backfillHashes(fromDate?: string, toDate?: string): Promise<{ updated: number }> {
    const logs = await this.auditLogRepo.find({
      where: {
        selfHash: IsNull(),
        ...(fromDate && toDate
          ? { createdAt: Between(new Date(fromDate), new Date(toDate)) }
          : {}),
      },
      order: { createdAt: 'ASC' },
    });

    let updated = 0;

    for (const log of logs) {
      log.selfHash = this.computeSelfHash(log);
      await this.auditLogRepo.save(log);
      updated++;
    }

    this.logger.log(`Backfilled ${updated} audit log hashes`);
    return { updated };
  }

  computeSelfHash(log: AuditLog): string {
    const payload = [
      log.id,
      log.actorId,
      log.action,
      log.createdAt instanceof Date
        ? log.createdAt.toISOString()
        : String(log.createdAt),
      JSON.stringify(log.metadata ?? {}),
      log.previousHash ?? '',
    ].join('|');

    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  private async fetchLogs(fromDate?: string, toDate?: string): Promise<AuditLog[]> {
    const qb = this.auditLogRepo
      .createQueryBuilder('log')
      .orderBy('log.created_at', 'ASC');

    if (fromDate) {
      qb.andWhere('log.created_at >= :from', { from: new Date(fromDate) });
    }
    if (toDate) {
      qb.andWhere('log.created_at <= :to', { to: new Date(toDate) });
    }

    return qb.getMany();
  }
}
