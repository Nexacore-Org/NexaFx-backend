import { Test, TestingModule } from '@nestjs/testing';
import { AdminExperimentsController } from './admin-experiments.controller';
import { ExperimentsService } from './experiments.service';
import { CreateExperimentDto } from './dto/create-experiment.dto';
import { UpdateExperimentDto } from './dto/update-experiment.dto';
import { ExperimentStatus } from './entities/experiment.entity';

describe('AdminExperimentsController', () => {
  let controller: AdminExperimentsController;
  let mockService: Record<string, jest.Mock>;

  beforeEach(async () => {
    mockService = {
      listExperiments: jest.fn(),
      createExperiment: jest.fn(),
      updateExperiment: jest.fn(),
      getExperimentResults: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminExperimentsController],
      providers: [{ provide: ExperimentsService, useValue: mockService }],
    }).compile();

    controller = module.get<AdminExperimentsController>(
      AdminExperimentsController,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('listExperiments', () => {
    it('should return all experiments', async () => {
      const experiments = [
        { id: 'exp-1', key: 'test-a', name: 'Test A' },
        { id: 'exp-2', key: 'test-b', name: 'Test B' },
      ];
      mockService.listExperiments.mockResolvedValue(experiments);

      const result = await controller.listExperiments();

      expect(mockService.listExperiments).toHaveBeenCalled();
      expect(result).toEqual(experiments);
    });
  });

  describe('createExperiment', () => {
    it('should create a new experiment with valid data', async () => {
      const dto: CreateExperimentDto = {
        key: 'new-test',
        name: 'New Test',
        description: 'A/B test for checkout',
        trafficPercent: 50,
        variants: [
          { key: 'control', name: 'Control', weight: 50 },
          { key: 'treatment', name: 'Treatment', weight: 50 },
        ],
      };

      const createdExperiment = {
        id: 'exp-new',
        ...dto,
        status: ExperimentStatus.DRAFT,
      };
      mockService.createExperiment.mockResolvedValue(createdExperiment);

      const result = await controller.createExperiment(dto);

      expect(mockService.createExperiment).toHaveBeenCalledWith(dto);
      expect(result.key).toBe('new-test');
      expect(result.status).toBe(ExperimentStatus.DRAFT);
    });

    it('should propagate validation errors from the service', async () => {
      const dto: CreateExperimentDto = {
        key: 'duplicate-key',
        name: 'Duplicate',
        variants: [{ key: 'a', name: 'A', weight: 100 }],
      };
      mockService.createExperiment.mockRejectedValue(
        new Error('Experiment with key "duplicate-key" already exists'),
      );

      await expect(controller.createExperiment(dto)).rejects.toThrow(
        'Experiment with key "duplicate-key" already exists',
      );
    });
  });

  describe('updateExperiment', () => {
    it('should update an existing experiment', async () => {
      const dto: UpdateExperimentDto = {
        name: 'Updated Name',
        status: ExperimentStatus.RUNNING,
      };
      const updatedExperiment = {
        id: 'exp-1',
        key: 'test',
        name: 'Updated Name',
        status: ExperimentStatus.RUNNING,
      };
      mockService.updateExperiment.mockResolvedValue(updatedExperiment);

      const result = await controller.updateExperiment('exp-1', dto);

      expect(mockService.updateExperiment).toHaveBeenCalledWith('exp-1', dto);
      expect(result.name).toBe('Updated Name');
    });

    it('should allow updating trafficPercent', async () => {
      const dto: UpdateExperimentDto = { trafficPercent: 25 };
      mockService.updateExperiment.mockResolvedValue({
        id: 'exp-1',
        trafficPercent: 25,
      });

      const result = await controller.updateExperiment('exp-1', dto);

      expect(mockService.updateExperiment).toHaveBeenCalledWith('exp-1', dto);
      expect(result.trafficPercent).toBe(25);
    });
  });

  describe('getResults', () => {
    it('should return experiment results with variant metrics', async () => {
      const mockResults = {
        experiment: { id: 'exp-1', key: 'test' },
        variants: [
          {
            variantKey: 'control',
            variantName: 'Control',
            assignments: 100,
            events: { click: 20 },
            conversionRate: 0.2,
          },
          {
            variantKey: 'treatment',
            variantName: 'Treatment',
            assignments: 100,
            events: { click: 35 },
            conversionRate: 0.35,
          },
        ],
        significance: [
          {
            controlKey: 'control',
            variantKey: 'treatment',
            pValue: 0.02,
            significant: true,
          },
        ],
      };
      mockService.getExperimentResults.mockResolvedValue(mockResults);

      const result = await controller.getResults('exp-1');

      expect(mockService.getExperimentResults).toHaveBeenCalledWith('exp-1');
      expect(result.variants).toHaveLength(2);
      expect(result.significance[0].significant).toBe(true);
    });

    it('should propagate NotFoundException when experiment does not exist', async () => {
      mockService.getExperimentResults.mockRejectedValue(
        new Error('Experiment with id "nonexistent" not found'),
      );

      await expect(controller.getResults('nonexistent')).rejects.toThrow(
        'Experiment with id "nonexistent" not found',
      );
    });
  });
});
