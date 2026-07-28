import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';
import { SpendingGoal } from './entities/spending-goal.entity';
import { NotificationsService } from '../../notifications/notifications.service';

@Injectable()
export class SpendingGoalsService {
  private readonly logger = new Logger(SpendingGoalsService.name);

  constructor(
    @InjectRepository(SpendingGoal)
    private readonly goalRepo: Repository<SpendingGoal>,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(
    userId: string,
    dto: {
      categoryId?: string;
      name: string;
      targetAmount: string;
      currency: string;
    },
  ): Promise<SpendingGoal> {
    const goal = this.goalRepo.create({ userId, ...dto });
    return this.goalRepo.save(goal);
  }

  async getAll(userId: string): Promise<SpendingGoal[]> {
    return this.goalRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async getAllWithProgress(userId: string) {
    const goals = await this.getAll(userId);
    return Promise.all(goals.map((g) => this.withProgress(g)));
  }

  async update(
    id: string,
    userId: string,
    dto: Partial<Pick<SpendingGoal, 'name' | 'targetAmount' | 'currency' | 'categoryId' | 'isActive'>>,
  ): Promise<SpendingGoal> {
    const goal = await this.findByIdAndUser(id, userId);
    Object.assign(goal, dto);
    return this.goalRepo.save(goal);
  }

  async delete(id: string, userId: string): Promise<void> {
    const goal = await this.findByIdAndUser(id, userId);
    await this.goalRepo.remove(goal);
  }

  async getProgress(goal: SpendingGoal) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const spent = await this.querySpent(
      goal.userId,
      goal.categoryId,
      monthStart,
      monthEnd,
    );

    const target = Number(goal.targetAmount);
    const remaining = Math.max(target - spent, 0);
    const percentUsed = target > 0 ? (spent / target) * 100 : 0;
    const daysLeft = Math.ceil(
      (monthEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
    ).getDate();
    const projectedTotal = dayOfMonth > 0 ? (spent / dayOfMonth) * daysInMonth : 0;

    return {
      spent: spent.toString(),
      remaining: remaining.toString(),
      percentUsed: Math.round(percentUsed * 100) / 100,
      daysLeft,
      projectedTotal: projectedTotal.toString(),
    };
  }

  async withProgress(goal: SpendingGoal) {
    const progress = await this.getProgress(goal);
    return { ...goal, progress };
  }

  async checkProjectedOverspend(userId: string): Promise<void> {
    const goals = await this.goalRepo.find({
      where: { userId, isActive: true },
    });

    for (const goal of goals) {
      const progress = await this.getProgress(goal);
      const percentUsed = Number(progress.percentUsed);
      const projected = Number(progress.projectedTotal);
      const target = Number(goal.targetAmount);

      if (percentUsed > 80 || projected > target) {
        await this.notificationsService.dispatch(
          userId,
          'SPENDING_GOAL_WARNING' as any,
          'Spending Goal Alert',
          percentUsed > 80
            ? `You've used ${percentUsed.toFixed(1)}% of your "${goal.name}" goal.`
            : `Your projected spending for "${goal.name}" ($${projected}) exceeds your target ($${target}).`,
        );
      }
    }
  }

  private async findByIdAndUser(id: string, userId: string): Promise<SpendingGoal> {
    const goal = await this.goalRepo.findOne({ where: { id, userId } });
    if (!goal) {
      throw new NotFoundException('Spending goal not found');
    }
    return goal;
  }

  private async querySpent(
    userId: string,
    categoryId: string | null,
    from: Date,
    to: Date,
  ): Promise<number> {
    const qb = this.goalRepo.manager
      .createQueryBuilder()
      .select('COALESCE(SUM(t.amount), 0)', 'spent')
      .from('transactions', 't')
      .where('t.user_id = :userId', { userId })
      .andWhere('t.created_at >= :from', { from })
      .andWhere('t.created_at <= :to', { to })
      .andWhere("t.type IN ('DEBIT', 'PAYMENT')");

    if (categoryId) {
      qb.andWhere('t.category_id = :categoryId', { categoryId });
    }

    const result = await qb.getRawOne<{ spent: string }>();
    return Number(result?.spent ?? 0);
  }
}
