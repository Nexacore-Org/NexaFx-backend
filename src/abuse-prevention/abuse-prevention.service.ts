import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AbuseSignal, SignalType } from './entities/abuse-signal.entity';

@Injectable()
export class AbusePreventionService {
  constructor(
    @InjectRepository(AbuseSignal)
    private readonly abuseSignalRepo: Repository<AbuseSignal>,
  ) {}

  async evaluate(userId: string, context: { type: SignalType; score: number; evidence?: Record<string, any> }): Promise<AbuseSignal | null> {
    const threshold = 75.0; // Configurable threshold

    if (context.score >= threshold) {
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

  async manualReport(userId: string, signalType: SignalType, score: number, evidence?: Record<string, any>): Promise<AbuseSignal> {
    const signal = this.abuseSignalRepo.create({
      userId,
      signalType,
      score,
      evidence: evidence || { source: 'manual_admin_report' },
    });
    return await this.abuseSignalRepo.save(signal);
  }

  async getOpenSignals(page = 1, limit = 20): Promise<{ data: AbuseSignal[]; total: number }> {
    const [data, total] = await this.abuseSignalRepo.findAndCount({
      where: { resolved: false },
      order: { detectedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total };
  }
}