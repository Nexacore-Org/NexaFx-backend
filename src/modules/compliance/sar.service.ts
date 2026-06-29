import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sar } from './entities/sar.entity';

@Injectable()
export class SarService {
  constructor(
    @InjectRepository(Sar)
    private readonly sarRepo: Repository<Sar>,
  ) {}

  async findByFlagId(flagId: string): Promise<Sar | null> {
    return this.sarRepo.findOne({ where: { flagId } });
  }

  async findByDateRange(from: Date, to: Date): Promise<Sar[]> {
    return this.sarRepo
      .createQueryBuilder('sar')
      .where('sar.filedAt >= :from', { from })
      .andWhere('sar.filedAt <= :to', { to })
      .getMany();
  }

  async countFiledThisMonth(): Promise<number> {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    return this.sarRepo.count({ where: { filedAt: startOfMonth } });
  }

  async countByFlagIds(flagIds: string[]): Promise<Map<string, number>> {
    if (flagIds.length === 0) return new Map();
    const counts = await this.sarRepo
      .createQueryBuilder('sar')
      .select('sar.flagId', 'flagId')
      .addSelect('COUNT(*)', 'count')
      .whereInIds(flagIds)
      .groupBy('sar.flagId')
      .getRawMany();
    const map = new Map<string, number>();
    for (const row of counts) {
      map.set(row.flagId, parseInt(row.count));
    }
    return map;
  }
}
