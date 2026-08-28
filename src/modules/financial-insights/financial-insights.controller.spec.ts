import { Test, TestingModule } from '@nestjs/testing';
import { FinancialInsightsController } from './financial-insights.controller';
import { FinancialInsightsService } from './financial-insights.service';
import { mock, DeepMockProxy } from 'jest-mock-extended';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Reflector } from '@nestjs/core';

describe('FinancialInsightsController', () => {
  let controller: FinancialInsightsController;
  let service: DeepMockProxy<FinancialInsightsService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FinancialInsightsController],
      providers: [
        {
          provide: FinancialInsightsService,
          useValue: mock<FinancialInsightsService>(),
        },
        {
          provide: JwtAuthGuard,
          useValue: mock<JwtAuthGuard>(),
        },
        {
          provide: Reflector,
          useValue: mock<Reflector>(),
        },
      ],
    }).compile();

    controller = module.get<FinancialInsightsController>(
      FinancialInsightsController,
    );
    service = module.get(FinancialInsightsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getInsights', () => {
    it('should call the service to get insights for a user', async () => {
      const req = { user: { id: 'user-1' } };
      await controller.getInsights(req);
      expect(service.getForUser).toHaveBeenCalledWith(req.user.id);
    });
  });
});
