import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CarbonOffsetRecord } from './entities/carbon-offset-record.entity';

/** kg CO2e credited per XLM offset — display only, configurable via CARBON_KG_PER_XLM (#696). */
const KG_CO2_PER_XLM = Number(process.env.CARBON_KG_PER_XLM ?? 0.0001);

@Injectable()
export class CarbonOffsetService {
  constructor(
    @InjectRepository(CarbonOffsetRecord)
    private readonly records: Repository<CarbonOffsetRecord>,
  ) {}

  /** Record a carbon offset for a completed transaction. */
  async recordOffset(
    userId: string,
    amountXlm: number,
    transactionId?: string,
  ): Promise<CarbonOffsetRecord> {
    const record = this.records.create({
      userId,
      transactionId: transactionId ?? null,
      amountXlm: amountXlm.toFixed(8),
      equivalentKgCo2: (amountXlm * KG_CO2_PER_XLM).toFixed(6),
    });
    return this.records.save(record);
  }

  /** Per-user offset stats. */
  async getStats(userId: string) {
    const records = await this.records.find({
      where: { userId },
      order: { createdAt: 'ASC' },
    });
    return {
      totalXlmOffset: records.reduce((sum, r) => sum + Number(r.amountXlm), 0),
      totalKgCo2Offset: records.reduce(
        (sum, r) => sum + Number(r.equivalentKgCo2),
        0,
      ),
      offsetCount: records.length,
      joinedDate: records[0]?.createdAt ?? null,
    };
  }

  /** Paginated per-user offset history. */
  async getHistory(userId: string, page = 1, limit = 20) {
    const [items, total] = await this.records.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit };
  }

  /** Public, community-wide offset stats. */
  async getCommunityStats() {
    const records = await this.records.find();
    const participants = new Set(records.map((r) => r.userId));
    return {
      totalUsersParticipating: participants.size,
      totalXlmOffset: records.reduce((sum, r) => sum + Number(r.amountXlm), 0),
      totalKgCo2Offset: records.reduce(
        (sum, r) => sum + Number(r.equivalentKgCo2),
        0,
      ),
      rankingToday: 'TOP 5%',
    };
  }
}
