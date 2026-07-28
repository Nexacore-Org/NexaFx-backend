import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FinancialInsight, InsightItem } from './entities/financial-insight.entity';

@Injectable()
export class FinancialInsightsService {
  constructor(
    @InjectRepository(FinancialInsight)
    private readonly insightRepo: Repository<FinancialInsight>,
  ) {}

  async getForUser(userId: string): Promise<FinancialInsight[]> {
    return this.insightRepo.find({
      where: { userId },
      order: { generatedAt: 'DESC' },
    });
  }

  async upsertWeekly(userId: string, weekOf: string, insights: InsightItem[]): Promise<FinancialInsight> {
    const existing = await this.insightRepo.findOne({ where: { userId, weekOf } });
    const insightTypes = [...new Set(insights.map((i) => i.type))];

    if (existing) {
      existing.insights = insights;
      existing.insightTypes = insightTypes;
      return this.insightRepo.save(existing);
    }

    return this.insightRepo.save(
      this.insightRepo.create({ userId, weekOf, insights, insightTypes }),
    );
  }
}
