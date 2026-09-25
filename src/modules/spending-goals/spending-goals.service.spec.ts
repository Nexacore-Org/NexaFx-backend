import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SpendingGoalsService } from './spending-goals.service';
import { GoalPeriod, SpendingGoal } from './entities/spending-goal.entity';
import { NotificationsService } from '../../notifications/notifications.service';
import { NotificationType } from '../../notifications/enum/notificationType.enum';
import { MicroSavingsService } from '../micro-savings/micro-savings.service';

// Manual mocks keep ts-jest from pulling in the real services' dependency trees
jest.mock('../../notifications/notifications.service', () => ({
  NotificationsService: jest.fn(),
}));
jest.mock('../micro-savings/micro-savings.service', () => ({
  MicroSavingsService: jest.fn(),
}));

describe('SpendingGoalsService', () => {
  let service: SpendingGoalsService;
  let goalRepo: Record<string, any>;
  let qb: Record<string, jest.Mock>;
  let notificationsService: { create: jest.Mock };
  let microSavingsService: { evaluateSpendingGoalHit: jest.Mock };

  const userId = 'user-1';

  const makeGoal = (overrides: Partial<SpendingGoal> = {}): SpendingGoal =>
    ({
      id: 'goal-1',
      userId,
      categoryId: null,
      name: 'Groceries',
      targetAmount: '1000',
      currency: 'USD',
      period: GoalPeriod.MONTHLY,
      isActive: true,
      createdAt: new Date('2026-09-01T00:00:00Z'),
      updatedAt: new Date('2026-09-01T00:00:00Z'),
      ...overrides,
    }) as SpendingGoal;

  const mockSpent = (spent: string | null) =>
    qb.getRawOne.mockResolvedValue(spent === null ? undefined : { spent });

  beforeEach(async () => {
    // 10 Sep 2026, 12:00 local: day 10 of a 30-day month
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(new Date(2026, 8, 10, 12, 0, 0));

    qb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ spent: '0' }),
    };

    goalRepo = {
      create: jest.fn((x) => ({ id: 'goal-new', ...x })),
      save: jest.fn(async (x) => x),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      remove: jest.fn().mockResolvedValue(undefined),
      manager: { createQueryBuilder: jest.fn(() => qb) },
    };
    notificationsService = { create: jest.fn().mockResolvedValue({}) };
    microSavingsService = {
      evaluateSpendingGoalHit: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SpendingGoalsService,
        { provide: getRepositoryToken(SpendingGoal), useValue: goalRepo },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: MicroSavingsService, useValue: microSavingsService },
      ],
    }).compile();

    service = module.get(SpendingGoalsService);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('create', () => {
    const dto = { name: 'Dining', targetAmount: '250', currency: 'USD' };

    it('creates and saves a goal owned by the caller', async () => {
      const result = await service.create(userId, dto);

      expect(goalRepo.create).toHaveBeenCalledWith({ ...dto, userId });
      expect(goalRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ userId, name: 'Dining' }),
      );
      expect(result).toEqual(expect.objectContaining({ id: 'goal-new', userId }));
    });

    it('passes an optional categoryId through', async () => {
      await service.create(userId, { ...dto, categoryId: 'cat-1' });

      expect(goalRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ categoryId: 'cat-1', userId }),
      );
    });

    it('ignores a userId smuggled into the request body', async () => {
      await service.create(userId, { ...dto, userId: 'attacker' } as any);

      expect(goalRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId }),
      );
    });

    it('propagates repository save errors', async () => {
      goalRepo.save.mockRejectedValue(new Error('db down'));

      await expect(service.create(userId, dto)).rejects.toThrow('db down');
    });
  });

  describe('getAll', () => {
    it('queries goals scoped to the user, newest first', async () => {
      const goals = [makeGoal()];
      goalRepo.find.mockResolvedValue(goals);

      await expect(service.getAll(userId)).resolves.toBe(goals);
      expect(goalRepo.find).toHaveBeenCalledWith({
        where: { userId },
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('getAllWithProgress', () => {
    it('attaches progress to every goal', async () => {
      goalRepo.find.mockResolvedValue([
        makeGoal({ id: 'g1' }),
        makeGoal({ id: 'g2', targetAmount: '600' }),
      ]);
      mockSpent('300');

      const result = await service.getAllWithProgress(userId);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(
        expect.objectContaining({
          id: 'g1',
          progress: expect.objectContaining({ spent: '300', remaining: '700' }),
        }),
      );
      expect(result[1].progress.percentUsed).toBe(50);
    });

    it('returns an empty list when the user has no goals', async () => {
      await expect(service.getAllWithProgress(userId)).resolves.toEqual([]);
      expect(goalRepo.manager.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('looks the goal up by id AND owner, then saves the changes', async () => {
      goalRepo.findOne.mockResolvedValue(makeGoal());

      const result = await service.update('goal-1', userId, {
        name: 'Food',
        targetAmount: '1200',
        isActive: false,
      });

      expect(goalRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'goal-1', userId },
      });
      expect(result).toEqual(
        expect.objectContaining({
          id: 'goal-1',
          userId,
          name: 'Food',
          targetAmount: '1200',
          isActive: false,
          currency: 'USD',
        }),
      );
      expect(goalRepo.save).toHaveBeenCalledWith(result);
    });

    it('throws NotFoundException when the goal does not exist or belongs to another user', async () => {
      goalRepo.findOne.mockResolvedValue(null);

      await expect(
        service.update('goal-1', 'other-user', { name: 'x' }),
      ).rejects.toThrow(NotFoundException);
      expect(goalRepo.save).not.toHaveBeenCalled();
    });

    it('does not allow id or userId to be overwritten from the body', async () => {
      goalRepo.findOne.mockResolvedValue(makeGoal());

      const result = await service.update('goal-1', userId, {
        name: 'Food',
        id: 'other-goal',
        userId: 'attacker',
      } as any);

      expect(result.id).toBe('goal-1');
      expect(result.userId).toBe(userId);
      expect(result.name).toBe('Food');
    });

    it('leaves fields untouched when they are omitted', async () => {
      goalRepo.findOne.mockResolvedValue(makeGoal({ categoryId: 'cat-1' }));

      const result = await service.update('goal-1', userId, {});

      expect(result.categoryId).toBe('cat-1');
      expect(result.targetAmount).toBe('1000');
    });
  });

  describe('delete', () => {
    it('removes the goal found for the owner', async () => {
      const goal = makeGoal();
      goalRepo.findOne.mockResolvedValue(goal);

      await service.delete('goal-1', userId);

      expect(goalRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'goal-1', userId },
      });
      expect(goalRepo.remove).toHaveBeenCalledWith(goal);
    });

    it('throws NotFoundException and removes nothing when not found', async () => {
      goalRepo.findOne.mockResolvedValue(null);

      await expect(service.delete('missing', userId)).rejects.toThrow(
        'Spending goal not found',
      );
      expect(goalRepo.remove).not.toHaveBeenCalled();
    });
  });

  describe('getProgress', () => {
    it('computes spent, remaining, percent, days left and projection for the current month', async () => {
      mockSpent('300');

      const progress = await service.getProgress(makeGoal());

      expect(progress).toEqual({
        spent: '300',
        remaining: '700',
        percentUsed: 30,
        daysLeft: 21,
        // 300 spent over 10 days, extrapolated to 30 days
        projectedTotal: '900',
      });
    });

    it('scopes the spend query to the user and the current calendar month', async () => {
      await service.getProgress(makeGoal());

      expect(qb.from).toHaveBeenCalledWith('transactions', 't');
      expect(qb.where).toHaveBeenCalledWith('t."userId" = :userId', { userId });
      expect(qb.andWhere).toHaveBeenCalledWith('t."createdAt" >= :from', {
        from: new Date(2026, 8, 1),
      });
      expect(qb.andWhere).toHaveBeenCalledWith('t."createdAt" <= :to', {
        to: new Date(2026, 8, 30, 23, 59, 59),
      });
    });

    it('filters by category only when the goal has one', async () => {
      await service.getProgress(makeGoal());
      expect(qb.andWhere).not.toHaveBeenCalledWith(
        't."categoryId" = :categoryId',
        expect.anything(),
      );

      qb.andWhere.mockClear();
      await service.getProgress(makeGoal({ categoryId: 'cat-1' }));
      expect(qb.andWhere).toHaveBeenCalledWith('t."categoryId" = :categoryId', {
        categoryId: 'cat-1',
      });
    });

    it('clamps remaining at zero and reports >100% when overspent', async () => {
      mockSpent('1500');

      const progress = await service.getProgress(makeGoal());

      expect(progress.remaining).toBe('0');
      expect(progress.percentUsed).toBe(150);
    });

    it('rounds percentUsed to two decimals', async () => {
      mockSpent('1');

      const progress = await service.getProgress(
        makeGoal({ targetAmount: '3' }),
      );

      expect(progress.percentUsed).toBe(33.33);
    });

    it('reports 0% instead of dividing by zero when the target is 0', async () => {
      mockSpent('50');

      const progress = await service.getProgress(
        makeGoal({ targetAmount: '0' }),
      );

      expect(progress.percentUsed).toBe(0);
      expect(progress.remaining).toBe('0');
    });

    it('treats a missing aggregate row as zero spend', async () => {
      mockSpent(null);

      const progress = await service.getProgress(makeGoal());

      expect(progress.spent).toBe('0');
      expect(progress.remaining).toBe('1000');
      expect(progress.projectedTotal).toBe('0');
    });

    it('propagates query failures', async () => {
      qb.getRawOne.mockRejectedValue(new Error('query failed'));

      await expect(service.getProgress(makeGoal())).rejects.toThrow(
        'query failed',
      );
    });
  });

  describe('withProgress', () => {
    it('returns the goal fields merged with its progress', async () => {
      mockSpent('100');
      const goal = makeGoal();

      const result = await service.withProgress(goal);

      expect(result).toEqual({
        ...goal,
        progress: expect.objectContaining({ spent: '100', percentUsed: 10 }),
      });
    });
  });

  describe('checkProjectedOverspend', () => {
    it('only evaluates active goals of the user', async () => {
      await service.checkProjectedOverspend(userId);

      expect(goalRepo.find).toHaveBeenCalledWith({
        where: { userId, isActive: true },
      });
    });

    it('does nothing when spending is on track', async () => {
      goalRepo.find.mockResolvedValue([makeGoal()]);
      // 200 over 10 days -> 600 projected, 20% used
      mockSpent('200');

      await service.checkProjectedOverspend(userId);

      expect(notificationsService.create).not.toHaveBeenCalled();
      expect(microSavingsService.evaluateSpendingGoalHit).not.toHaveBeenCalled();
    });

    it('warns with the percentage message when more than 80% is used', async () => {
      goalRepo.find.mockResolvedValue([makeGoal()]);
      mockSpent('850');

      await service.checkProjectedOverspend(userId);

      expect(notificationsService.create).toHaveBeenCalledWith({
        userId,
        type: NotificationType.SPENDING_GOAL_WARNING,
        title: 'Spending Goal Alert',
        message: 'You\'ve used 85.0% of your "Groceries" goal.',
      });
      expect(microSavingsService.evaluateSpendingGoalHit).not.toHaveBeenCalled();
    });

    it('warns with the projection message when projected spend exceeds the target', async () => {
      goalRepo.find.mockResolvedValue([makeGoal()]);
      // 400 over 10 days -> 1200 projected, 40% used
      mockSpent('400');

      await service.checkProjectedOverspend(userId);

      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          message:
            'Your projected spending for "Groceries" ($1200) exceeds your target ($1000).',
        }),
      );
    });

    it('triggers micro-savings evaluation when the goal is fully used', async () => {
      goalRepo.find.mockResolvedValue([makeGoal()]);
      mockSpent('1000');

      await service.checkProjectedOverspend(userId);

      expect(notificationsService.create).toHaveBeenCalledTimes(1);
      expect(microSavingsService.evaluateSpendingGoalHit).toHaveBeenCalledWith(
        userId,
        'goal-1',
      );
    });

    it('logs and swallows micro-savings failures', async () => {
      goalRepo.find.mockResolvedValue([makeGoal()]);
      mockSpent('1000');
      microSavingsService.evaluateSpendingGoalHit.mockRejectedValue(
        new Error('vault offline'),
      );
      const logSpy = jest
        .spyOn((service as any).logger, 'error')
        .mockImplementation(() => undefined);

      await expect(service.checkProjectedOverspend(userId)).resolves.toBeUndefined();
      // let the fire-and-forget rejection handler run
      await new Promise((r) => setImmediate(r));

      expect(logSpy).toHaveBeenCalledWith(
        'Micro-savings spending-goal-hit eval failed: vault offline',
      );
    });

    it('evaluates each goal independently', async () => {
      goalRepo.find.mockResolvedValue([
        makeGoal({ id: 'g1', name: 'A' }),
        makeGoal({ id: 'g2', name: 'B', targetAmount: '10000' }),
      ]);
      mockSpent('900');

      await service.checkProjectedOverspend(userId);

      // g1: 90% used -> warn; g2: 9% used, 2700 projected -> no warning
      expect(notificationsService.create).toHaveBeenCalledTimes(1);
      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('"A"') }),
      );
    });
  });
});
