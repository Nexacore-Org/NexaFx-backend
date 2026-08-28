import { Test, TestingModule } from '@nestjs/testing';
import { FraudController } from './fraud.controller';
import { FraudService } from './fraud.service';

describe('FraudController', () => {
  let controller: FraudController;
  let service: {
    getFraudAlerts: jest.Mock;
    updateFraudAlertStatus: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      getFraudAlerts: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 }),
      updateFraudAlertStatus: jest
        .fn()
        .mockResolvedValue({ id: 'a1', status: 'RESOLVED' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FraudController],
      providers: [{ provide: FraudService, useValue: service }],
    })
      .overrideGuard(
        // Avoid importing potentially path-divergent guards; stub any guard
        class JwtAuthGuard {},
      )
      .useValue({ canActivate: () => true })
      .overrideGuard(class RolesGuard {})
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(FraudController);
  });

  afterEach(() => jest.clearAllMocks());

  it('is defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getFraudAlerts', () => {
    it('delegates query filters to service', async () => {
      const query = { page: 1, limit: 20, status: 'OPEN' as any };
      await controller.getFraudAlerts(query);
      expect(service.getFraudAlerts).toHaveBeenCalledWith(query);
    });
  });

  describe('updateFraudAlertStatus', () => {
    it('updates status via service', async () => {
      const result = await controller.updateFraudAlertStatus('a1', {
        status: 'RESOLVED' as any,
      });
      expect(service.updateFraudAlertStatus).toHaveBeenCalledWith(
        'a1',
        'RESOLVED',
      );
      expect(result).toEqual({ id: 'a1', status: 'RESOLVED' });
    });

    it('returns 404-shaped payload when alert missing', async () => {
      service.updateFraudAlertStatus.mockResolvedValue(null);
      const result = await controller.updateFraudAlertStatus('missing', {
        status: 'RESOLVED' as any,
      });
      expect(result).toEqual({
        statusCode: 404,
        message: 'Fraud alert not found',
      });
    });
  });
});
