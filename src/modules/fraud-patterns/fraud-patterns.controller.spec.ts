import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { FraudPatternsController } from './fraud-patterns.controller';
import { FraudPatternsService } from './fraud-patterns.service';

describe('FraudPatternsController', () => {
  let controller: FraudPatternsController;
  let service: {
    create: jest.Mock;
    findAll: jest.Mock;
    update: jest.Mock;
    deactivate: jest.Mock;
    test: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      create: jest.fn(),
      findAll: jest.fn(),
      update: jest.fn(),
      deactivate: jest.fn(),
      test: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FraudPatternsController],
      providers: [{ provide: FraudPatternsService, useValue: service }],
    }).compile();

    controller = module.get(FraudPatternsController);
  });

  afterEach(() => jest.clearAllMocks());

  it('create delegates to service', () => {
    const dto = {
      name: 'x',
      description: 'y',
      severity: 'LOW' as const,
      action: 'FLAG' as const,
      conditions: [],
    };
    service.create.mockReturnValue({ id: '1', ...dto });
    expect(controller.create(dto)).toEqual({ id: '1', ...dto });
    expect(service.create).toHaveBeenCalledWith(dto);
  });

  it('findAll returns all patterns', () => {
    service.findAll.mockReturnValue([]);
    expect(controller.findAll()).toEqual([]);
  });

  it('update delegates with id and dto', () => {
    service.update.mockReturnValue({ id: '1', name: 'updated' });
    expect(controller.update('1', { name: 'updated' })).toEqual({
      id: '1',
      name: 'updated',
    });
  });

  it('deactivate (DELETE) sets inactive', () => {
    service.deactivate.mockReturnValue({ id: '1', isActive: false });
    expect(controller.deactivate('1')).toEqual({ id: '1', isActive: false });
  });

  it('test dry-runs a pattern scenario', () => {
    service.test.mockReturnValue({ matched: true, conditions: [] });
    expect(
      controller.test({
        patternId: 'p1',
        transactionScenario: { amountUsd: 100 },
      }),
    ).toEqual({ matched: true, conditions: [] });
  });

  it('propagates NotFoundException from service', () => {
    service.deactivate.mockImplementation(() => {
      throw new NotFoundException('not found');
    });
    expect(() => controller.deactivate('missing')).toThrow(NotFoundException);
  });
});
