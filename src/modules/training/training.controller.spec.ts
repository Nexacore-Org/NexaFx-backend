import { Test, TestingModule } from '@nestjs/testing';
import { TrainingController } from './training.controller';
import { TrainingService } from './training.service';
import { ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';

describe('TrainingController', () => {
  let controller: TrainingController;
  let trainingService: jest.Mocked<TrainingService>;

  const mockTrainingService = {
    assignModule: jest.fn(),
    completeRecord: jest.fn(),
    getTrainingStatus: jest.fn(),
    getComplianceReport: jest.fn(),
  };

  const mockJwtAuthGuard = {
    canActivate: (context: ExecutionContext) => {
      const req = context.switchToHttp().getRequest();
      req.user = { userId: 'admin-1', role: 'ADMIN' };
      return true;
    },
  };

  const mockRolesGuard = {
    canActivate: () => true,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TrainingController],
      providers: [{ provide: TrainingService, useValue: mockTrainingService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtAuthGuard)
      .overrideGuard(RolesGuard)
      .useValue(mockRolesGuard)
      .compile();

    controller = module.get<TrainingController>(TrainingController);
    trainingService = module.get(TrainingService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('assignModule', () => {
    it('delegates to service.assignModule with moduleId and userIds', async () => {
      trainingService.assignModule.mockResolvedValue([]);

      const result = await controller.assignModule({
        moduleId: 'mod-1',
        userIds: ['u1', 'u2'],
      });

      expect(trainingService.assignModule).toHaveBeenCalledWith('mod-1', [
        'u1',
        'u2',
      ]);
      expect(result).toEqual([]);
    });
  });

  describe('getUserRecords', () => {
    it('delegates to service.getTrainingStatus', async () => {
      trainingService.getTrainingStatus.mockResolvedValue([]);

      const result = await controller.getUserRecords('user-1');

      expect(trainingService.getTrainingStatus).toHaveBeenCalledWith('user-1');
      expect(result).toEqual([]);
    });
  });

  describe('getComplianceReport', () => {
    it('delegates to service.getComplianceReport', async () => {
      trainingService.getComplianceReport.mockResolvedValue([]);

      const result = await controller.getComplianceReport();

      expect(trainingService.getComplianceReport).toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });

  describe('completeRecord', () => {
    it('delegates to service.completeRecord with id and optional score', async () => {
      trainingService.completeRecord.mockResolvedValue({ id: 'rec-1' } as any);

      await controller.completeRecord('rec-1', 90);

      expect(trainingService.completeRecord).toHaveBeenCalledWith('rec-1', 90);
    });

    it('delegates to service.completeRecord without score when not provided', async () => {
      trainingService.completeRecord.mockResolvedValue({ id: 'rec-1' } as any);

      await controller.completeRecord('rec-1');

      expect(trainingService.completeRecord).toHaveBeenCalledWith(
        'rec-1',
        undefined,
      );
    });
  });

  describe('route protection', () => {
    it('controller is decorated with @Controller("admin/training")', () => {
      const metadata = Reflect.getMetadata('path', TrainingController);
      expect(metadata).toBe('admin/training');
    });
  });
});
