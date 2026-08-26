import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { TrainingModule } from './entities/training-module.entity';
import { StaffTrainingRecord, TrainingStatus } from './entities/staff-training-record.entity';

@Injectable()
export class TrainingService {
  constructor(
    @InjectRepository(TrainingModule)
    private readonly moduleRepo: Repository<TrainingModule>,
    @InjectRepository(StaffTrainingRecord)
    private readonly recordRepo: Repository<StaffTrainingRecord>,
  ) {}

  async assignModule(moduleId: string, userIds: string[]): Promise<StaffTrainingRecord[]> {
    const mod = await this.moduleRepo.findOne({ where: { id: moduleId } });
    if (!mod) throw new NotFoundException('Training module not found');

    const now = new Date();
    const records = userIds.map((userId) =>
      this.recordRepo.create({
        userId,
        moduleId,
        status: TrainingStatus.ASSIGNED,
        assignedAt: now,
      }),
    );

    return this.recordRepo.save(records);
  }

  async completeRecord(recordId: string, score?: number): Promise<StaffTrainingRecord> {
    const record = await this.recordRepo.findOne({
      where: { id: recordId },
      relations: ['module'],
    });
    if (!record) throw new NotFoundException('Training record not found');

    const now = new Date();
    record.status = TrainingStatus.COMPLETED;
    record.completedAt = now;
    record.score = score ?? null;
    record.attempts += 1;

    if (record.module) {
      const expires = new Date(now);
      expires.setMonth(expires.getMonth() + record.module.validityMonths);
      record.expiresAt = expires;
    }

    return this.recordRepo.save(record);
  }

  async getOverdueTrainings(): Promise<StaffTrainingRecord[]> {
    const now = new Date();
    return this.recordRepo.find({
      where: {
        status: TrainingStatus.EXPIRED,
      },
      relations: ['module'],
      order: { assignedAt: 'ASC' },
    });
  }

  async getTrainingStatus(userId: string): Promise<StaffTrainingRecord[]> {
    return this.recordRepo.find({
      where: { userId },
      relations: ['module'],
      order: { assignedAt: 'DESC' },
    });
  }

  async getComplianceReport(): Promise<
    { userId: string; total: number; overdue: number; completed: number }[]
  > {
    const records = await this.recordRepo.find({ relations: ['module'] });
    const now = new Date();

    const grouped: Record<
      string,
      { total: number; overdue: number; completed: number }
    > = {};

    for (const r of records) {
      if (!grouped[r.userId]) grouped[r.userId] = { total: 0, overdue: 0, completed: 0 };
      grouped[r.userId].total++;

      if (r.status === TrainingStatus.COMPLETED && r.expiresAt && r.expiresAt < now) {
        grouped[r.userId].overdue++;
      } else if (r.status === TrainingStatus.EXPIRED) {
        grouped[r.userId].overdue++;
      } else if (r.status === TrainingStatus.COMPLETED) {
        grouped[r.userId].completed++;
      }
    }

    return Object.entries(grouped).map(([userId, data]) => ({ userId, ...data }));
  }

  async enforceAccess(userId: string): Promise<{ allowed: boolean; overdueCount: number }> {
    const now = new Date();
    const records = await this.recordRepo.find({
      where: { userId },
      relations: ['module'],
    });

    const overdue = records.filter(
      (r) =>
        r.module?.isRequired &&
        ((r.status === TrainingStatus.COMPLETED && r.expiresAt && r.expiresAt < now) ||
          r.status === TrainingStatus.EXPIRED),
    );

    return { allowed: overdue.length === 0, overdueCount: overdue.length };
  }
}
