import { Test, TestingModule } from '@nestjs/testing';
import { MicroSavingsController } from './micro-savings.controller';
import { MicroSavingsService } from './micro-savings.service';
import { MicroSavingsTriggerType } from './entities/micro-savings-rule.entity';

describe('MicroSavingsController', () => {
  let controller: MicroSavingsController;
  let service: Record<string, jest.Mock>;

  const req = { user: { userId: 'user-42' } };

  beforeEach(async () => {
    service = {
      createRule: jest.fn().mockResolvedValue({ id: 'r1' }),
      listActiveRules: jest.fn().mockResolvedValue([]),
      updateRule: jest.fn().mockResolvedValue({ id: 'r1', isActive: false }),
      deleteRule: jest.fn().mockResolvedValue(undefined),
      getHistory: jest.fn().mockResolvedValue({ contributions: [], total: 0 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MicroSavingsController],
      providers: [{ provide: MicroSavingsService, useValue: service }],
    }).compile();

    controller = module.get(MicroSavingsController);
  });

  it('create forwards userId and dto', async () => {
    const dto = {
      targetVaultId: 'v1',
      triggerType: MicroSavingsTriggerType.PER_TRANSACTION,
      saveAmount: 1,
      maxDailyContribution: 10,
    };
    await controller.create(req, dto as any);
    expect(service.createRule).toHaveBeenCalledWith('user-42', dto);
  });

  it('list uses authenticated user', async () => {
    await controller.list(req);
    expect(service.listActiveRules).toHaveBeenCalledWith('user-42');
  });

  it('update deactivates rule via dto', async () => {
    await controller.update(req, 'rule-9', { isActive: false });
    expect(service.updateRule).toHaveBeenCalledWith('user-42', 'rule-9', {
      isActive: false,
    });
  });

  it('remove deletes rule and returns { deleted: true }', async () => {
    const result = await controller.remove(req, 'rule-9');
    expect(service.deleteRule).toHaveBeenCalledWith('user-42', 'rule-9');
    expect(result).toEqual({ deleted: true });
  });

  it('history passes pagination defaults', async () => {
    await controller.history(req, undefined, undefined);
    expect(service.getHistory).toHaveBeenCalledWith('user-42', 1, 50);
  });

  it('history forwards page and limit', async () => {
    await controller.history(req, 2, 25);
    expect(service.getHistory).toHaveBeenCalledWith('user-42', 2, 25);
  });
});
