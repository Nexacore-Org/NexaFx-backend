import { NotFoundException } from '@nestjs/common';
import { GUARDS_METADATA, VERSION_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import { SpendingGoalsController } from './spending-goals.controller';
import { SpendingGoalsService } from './spending-goals.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

// Manual mock prevents ts-jest from transpiling the real service
jest.mock('./spending-goals.service', () => ({
  SpendingGoalsService: jest.fn(),
}));

describe('SpendingGoalsController', () => {
  let controller: SpendingGoalsController;

  const mockService = {
    create: jest.fn(),
    getAllWithProgress: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  const req = { user: { id: 'user-1' } };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SpendingGoalsController],
      providers: [{ provide: SpendingGoalsService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(SpendingGoalsController);
  });

  it('is protected by JwtAuthGuard and served under v2/spending-goals', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, SpendingGoalsController);
    expect(guards).toContain(JwtAuthGuard);
    expect(Reflect.getMetadata(PATH_METADATA, SpendingGoalsController)).toBe(
      'spending-goals',
    );
    expect(Reflect.getMetadata(VERSION_METADATA, SpendingGoalsController)).toBe(
      '2',
    );
  });

  describe('create', () => {
    const dto = { name: 'Dining', targetAmount: '250', currency: 'USD' };

    it('creates a goal for the authenticated user', async () => {
      const created = { id: 'goal-1', userId: 'user-1', ...dto };
      mockService.create.mockResolvedValue(created);

      await expect(controller.create(req, dto)).resolves.toBe(created);
      expect(mockService.create).toHaveBeenCalledWith('user-1', dto);
    });

    it('propagates service errors', async () => {
      mockService.create.mockRejectedValue(new Error('db down'));

      await expect(controller.create(req, dto)).rejects.toThrow('db down');
    });
  });

  describe('list', () => {
    it('returns the caller’s goals with progress', async () => {
      const goals = [{ id: 'goal-1', progress: { spent: '10' } }];
      mockService.getAllWithProgress.mockResolvedValue(goals);

      await expect(controller.list(req)).resolves.toBe(goals);
      expect(mockService.getAllWithProgress).toHaveBeenCalledWith('user-1');
    });
  });

  describe('update', () => {
    it('updates the goal scoped to the caller', async () => {
      const updated = { id: 'goal-1', name: 'Food' };
      mockService.update.mockResolvedValue(updated);

      await expect(
        controller.update(req, 'goal-1', { name: 'Food' }),
      ).resolves.toBe(updated);
      expect(mockService.update).toHaveBeenCalledWith('goal-1', 'user-1', {
        name: 'Food',
      });
    });

    it('propagates NotFoundException for goals the caller does not own', async () => {
      mockService.update.mockRejectedValue(
        new NotFoundException('Spending goal not found'),
      );

      await expect(
        controller.update(req, 'goal-x', { name: 'Food' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('deletes the goal and returns a confirmation', async () => {
      mockService.delete.mockResolvedValue(undefined);

      await expect(controller.remove(req, 'goal-1')).resolves.toEqual({
        deleted: true,
      });
      expect(mockService.delete).toHaveBeenCalledWith('goal-1', 'user-1');
    });

    it('propagates NotFoundException when the goal does not exist', async () => {
      mockService.delete.mockRejectedValue(
        new NotFoundException('Spending goal not found'),
      );

      await expect(controller.remove(req, 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
