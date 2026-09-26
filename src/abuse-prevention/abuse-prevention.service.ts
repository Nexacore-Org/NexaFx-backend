import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AbuseSignal, SignalType } from './entities/abuse-signal.entity';

/**
 * Abuse prevention service.
 *
 * Detects and records account-level abuse signals (rapid repeated failed
 * logins, KYC resubmission spam, referral-code farming, etc.) and exposes
 * admin review/clear operations. Distinct from the transaction-level
 * fraud / fraud-risk-scoring modules.
 */
@Injectable()
export class AbusePreventionService {
  /** Score at or above which an evaluated signal is persisted as abuse. */
  private readonly threshold = 75.0;

  constructor(
    @InjectRepository(AbuseSignal)
    private readonly abuseSignalRepo: Repository<AbuseSignal>,
  ) {}

  /**
   * Evaluate an incoming abuse signal for a user. Persists and returns the
   * signal when its score meets the abuse threshold, otherwise returns null.
   */
  async evaluate(
    userId: string,
    context: { type: SignalType; score: number; evidence?: Record<string, any> },
  ): Promise<AbuseSignal | null> {
    if (context.score >= this.threshold) {
      const signal = this.abuseSignalRepo.create({
        userId,
        signalType: context.type,
        score: context.score,
        evidence: context.evidence || {},
      });
      return await this.abuseSignalRepo.save(signal);
    }

    return null;
  }

  /**
   * Record a manually reported abuse signal (e.g. from an admin or a
   * downstream detector that does not go through {@link evaluate}).
   */
  async manualReport(
    userId: string,
    signalType: SignalType,
    score: number,
    evidence?: Record<string, any>,
  ): Promise<AbuseSignal> {
    const signal = this.abuseSignalRepo.create({
      userId,
      signalType,
      score,
      evidence: evidence || { source: 'manual_admin_report' },
    });
    return await this.abuseSignalRepo.save(signal);
  }

  /**
   * List unresolved abuse signals for admin review, newest first.
   */
  async getOpenSignals(
    page = 1,
    limit = 20,
  ): Promise<{ data: AbuseSignal[]; total: number }> {
    const [data, total] = await this.abuseSignalRepo.findAndCount({
      where: { resolved: false },
      order: { detectedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total };
  }

  /**
   * Mark a signal as resolved (cleared) by an admin. Throws when the
   * signal does not exist.
   */
  async clearSignal(id: string, resolvedBy?: string): Promise<AbuseSignal> {
    const signal = await this.abuseSignalRepo.findOne({ where: { id } });
    if (!signal) {
      throw new NotFoundException(`Abuse signal ${id} not found`);
    }

    signal.resolved = true;
    signal.resolvedAt = new Date();
    if (resolvedBy) {
      signal.resolvedBy = resolvedBy;
    }

    return await this.abuseSignalRepo.save(signal);
  }
}
