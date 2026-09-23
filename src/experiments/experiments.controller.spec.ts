import { Test, TestingModule } from '@nestjs/testing';
import { ExperimentsController } from './experiments.controller';
import { ExperimentsService } from './experiments.service';

describe('ExperimentsController', () => {
  let controller: ExperimentsController;
  let mockService: Record<string, jest.Mock>;

  const req = { user: { userId: 'user-42' } };

  beforeEach(async () => {
    mockService = {
      getUserAssignments: jest.fn(),
      trackEvent: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExperimentsController],
      providers: [{ provide: ExperimentsService, useValue: mockService }],
    }).compile();

    controller = module.get<ExperimentsController>(ExperimentsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getAssignments', () => {
    it('should delegate to getUserAssignments with the authenticated userId', async () => {
      const assignments = [
        { experimentKey: 'checkout', variantKey: 'control', config: {} },
      ];
      mockService.getUserAssignments.mockResolvedValue(assignments);

      const result = await controller.getAssignments(req);

      expect(mockService.getUserAssignments).toHaveBeenCalledWith('user-42');
      expect(result).toEqual(assignments);
    });

    it('should return empty array when user has no assignments', async () => {
      mockService.getUserAssignments.mockResolvedValue([]);

      const result = await controller.getAssignments(req);

      expect(result).toEqual([]);
    });
  });

  describe('trackEvent', () => {
    it('should delegate to trackEvent with correct arguments', async () => {
      mockService.trackEvent.mockResolvedValue(undefined);

      const dto = {
        experimentKey: 'checkout-flow',
        eventName: 'purchase',
        metadata: { amount: 99.99 },
      };

      const result = await controller.trackEvent(req, dto);

      expect(mockService.trackEvent).toHaveBeenCalledWith(
        'checkout-flow',
        'user-42',
        'purchase',
        { amount: 99.99 },
      );
      expect(result).toEqual({ success: true });
    });

    it('should track event without metadata', async () => {
      mockService.trackEvent.mockResolvedValue(undefined);

      const dto = {
        experimentKey: 'signup-test',
        eventName: 'click',
      };

      const result = await controller.trackEvent(req, dto);

      expect(mockService.trackEvent).toHaveBeenCalledWith(
        'signup-test',
        'user-42',
        'click',
        undefined,
      );
      expect(result).toEqual({ success: true });
    });

    it('should propagate errors from the service', async () => {
      mockService.trackEvent.mockRejectedValue(
        new Error('Experiment not found'),
      );

      await expect(
        controller.trackEvent(req, {
          experimentKey: 'nonexistent',
          eventName: 'click',
        }),
      ).rejects.toThrow('Experiment not found');
    });
  });
});
