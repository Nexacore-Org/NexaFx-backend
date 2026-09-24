import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { ExperimentsService } from './experiments.service';
import { Experiment, ExperimentStatus } from './entities/experiment.entity';
import { ExperimentVariant } from './entities/experiment-variant.entity';
import { ExperimentAssignment } from './entities/experiment-assignment.entity';
import { ExperimentEvent } from './entities/experiment-event.entity';
import { CreateExperimentDto } from './dto/create-experiment.dto';

describe('ExperimentsService', () => {
  let service: ExperimentsService;

  const mockExperimentRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockVariantRepo = {
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockAssignmentRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    count: jest.fn(),
  };

  const mockEventRepo = {
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExperimentsService,
        {
          provide: getRepositoryToken(Experiment),
          useValue: mockExperimentRepo,
        },
        {
          provide: getRepositoryToken(ExperimentVariant),
          useValue: mockVariantRepo,
        },
        {
          provide: getRepositoryToken(ExperimentAssignment),
          useValue: mockAssignmentRepo,
        },
        {
          provide: getRepositoryToken(ExperimentEvent),
          useValue: mockEventRepo,
        },
      ],
    }).compile();

    service = module.get<ExperimentsService>(ExperimentsService);
  });

  // ── getVariant ──────────────────────────────────────────────────────────────

  describe('getVariant', () => {
    const userId = 'user-123';
    const experimentKey = 'checkout-flow';

    const makeExperiment = (overrides: Partial<Experiment> = {}): Experiment =>
      ({
        id: 'exp-1',
        key: experimentKey,
        name: 'Checkout Flow',
        status: ExperimentStatus.RUNNING,
        trafficPercent: 100,
        variants: [
          {
            id: 'v-1',
            key: 'control',
            name: 'Control',
            weight: 50,
            config: { buttonColor: 'blue' },
          },
          {
            id: 'v-2',
            key: 'treatment',
            name: 'Treatment',
            weight: 50,
            config: { buttonColor: 'green' },
          },
        ] as ExperimentVariant[],
        ...overrides,
      }) as unknown as Experiment;

    it('should return null when experiment is not found', async () => {
      mockExperimentRepo.findOne.mockResolvedValue(null);

      const result = await service.getVariant(experimentKey, userId);

      expect(result).toEqual({ variantKey: null, config: null });
    });

    it('should return null when experiment is not RUNNING', async () => {
      mockExperimentRepo.findOne.mockResolvedValue(null);

      const result = await service.getVariant(experimentKey, userId);

      expect(result).toEqual({ variantKey: null, config: null });
    });

    it('should return existing assignment if user already assigned', async () => {
      const experiment = makeExperiment();
      mockExperimentRepo.findOne.mockResolvedValue(experiment);

      const existingAssignment = {
        experimentId: 'exp-1',
        userId,
        variant: { id: 'v-1', key: 'control', config: { buttonColor: 'blue' } },
      };
      mockAssignmentRepo.findOne.mockResolvedValue(existingAssignment);

      const result = await service.getVariant(experimentKey, userId);

      expect(result).toEqual({
        variantKey: 'control',
        config: { buttonColor: 'blue' },
      });
      // Should not create a new assignment
      expect(mockAssignmentRepo.create).not.toHaveBeenCalled();
    });

    it('should assign a new user to a variant and persist the assignment', async () => {
      const experiment = makeExperiment();
      mockExperimentRepo.findOne.mockResolvedValue(experiment);
      // No existing assignment
      mockAssignmentRepo.findOne.mockResolvedValue(null);

      const createdAssignment = {
        id: 'a-1',
        experimentId: 'exp-1',
        userId,
        variantId: 'v-1',
      };
      mockAssignmentRepo.create.mockReturnValue(createdAssignment);
      mockAssignmentRepo.save.mockResolvedValue(createdAssignment);

      const result = await service.getVariant(experimentKey, userId);

      expect(result.variantKey).toBeDefined();
      expect(['control', 'treatment']).toContain(result.variantKey);
      expect(mockAssignmentRepo.save).toHaveBeenCalledWith(createdAssignment);
    });

    it('should return null when user falls outside traffic percent', async () => {
      const experiment = makeExperiment({ trafficPercent: 0 });
      mockExperimentRepo.findOne.mockResolvedValue(experiment);
      mockAssignmentRepo.findOne.mockResolvedValue(null);

      const result = await service.getVariant(experimentKey, userId);

      expect(result).toEqual({ variantKey: null, config: null });
    });

    it('should return null when total variant weight is 0', async () => {
      const experiment = makeExperiment();
      (experiment as any).variants = [
        { id: 'v-1', key: 'a', name: 'A', weight: 0, config: {} },
        { id: 'v-2', key: 'b', name: 'B', weight: 0, config: {} },
      ];
      mockExperimentRepo.findOne.mockResolvedValue(experiment);
      mockAssignmentRepo.findOne.mockResolvedValue(null);

      const result = await service.getVariant(experimentKey, userId);

      expect(result).toEqual({ variantKey: null, config: null });
    });

    it('should return the same variant on repeated calls (stable assignment)', async () => {
      const experiment = makeExperiment();
      mockExperimentRepo.findOne.mockResolvedValue(experiment);
      // First call: no existing assignment
      mockAssignmentRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          experimentId: 'exp-1',
          userId,
          variant: {
            id: 'v-2',
            key: 'treatment',
            config: { buttonColor: 'green' },
          },
        });

      const result1 = await service.getVariant(experimentKey, userId);
      const result2 = await service.getVariant(experimentKey, userId);

      // The second call should return the same variant (from the assignment found)
      expect(result1.variantKey).toBeDefined();
      expect(result2.variantKey).toBe(result1.variantKey);
      expect(result2.config).toEqual(result1.config);
    });
  });

  // ── trackEvent ──────────────────────────────────────────────────────────────

  describe('trackEvent', () => {
    it('should throw NotFoundException when experiment does not exist', async () => {
      mockExperimentRepo.findOne.mockResolvedValue(null);

      await expect(
        service.trackEvent('nonexistent', 'user-1', 'click'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when user has no assignment', async () => {
      mockExperimentRepo.findOne.mockResolvedValue({
        id: 'exp-1',
        key: 'test',
      });
      mockAssignmentRepo.findOne.mockResolvedValue(null);

      await expect(
        service.trackEvent('test', 'user-1', 'click'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create and save an event when user is assigned', async () => {
      mockExperimentRepo.findOne.mockResolvedValue({
        id: 'exp-1',
        key: 'test',
      });
      mockAssignmentRepo.findOne.mockResolvedValue({
        id: 'assign-1',
        experimentId: 'exp-1',
        userId: 'user-1',
      });

      const mockEvent = { id: 'evt-1', eventName: 'click' };
      mockEventRepo.create.mockReturnValue(mockEvent);
      mockEventRepo.save.mockResolvedValue(mockEvent);

      await service.trackEvent('test', 'user-1', 'click', {
        page: '/checkout',
      });

      expect(mockEventRepo.create).toHaveBeenCalledWith({
        experimentId: 'exp-1',
        assignmentId: 'assign-1',
        eventName: 'click',
        metadata: { page: '/checkout' },
      });
      expect(mockEventRepo.save).toHaveBeenCalledWith(mockEvent);
    });

    it('should track event without metadata', async () => {
      mockExperimentRepo.findOne.mockResolvedValue({
        id: 'exp-1',
        key: 'test',
      });
      mockAssignmentRepo.findOne.mockResolvedValue({
        id: 'assign-1',
        experimentId: 'exp-1',
        userId: 'user-1',
      });
      mockEventRepo.create.mockReturnValue({});
      mockEventRepo.save.mockResolvedValue({});

      await service.trackEvent('test', 'user-1', 'purchase');

      expect(mockEventRepo.create).toHaveBeenCalledWith({
        experimentId: 'exp-1',
        assignmentId: 'assign-1',
        eventName: 'purchase',
        metadata: undefined,
      });
    });
  });

  // ── getUserAssignments ──────────────────────────────────────────────────────

  describe('getUserAssignments', () => {
    it('should return empty array when no running experiments exist', async () => {
      mockExperimentRepo.find.mockResolvedValue([]);

      const result = await service.getUserAssignments('user-1');

      expect(result).toEqual([]);
    });

    it('should return existing assignments without re-assigning', async () => {
      const experiment = {
        id: 'exp-1',
        key: 'checkout',
        status: ExperimentStatus.RUNNING,
      } as Experiment;

      mockExperimentRepo.find.mockResolvedValue([experiment]);

      const existingAssignment = {
        id: 'a-1',
        experimentId: 'exp-1',
        userId: 'user-1',
        experiment: { key: 'checkout' },
        variant: { key: 'control', config: { color: 'blue' } },
      };
      mockAssignmentRepo.find.mockResolvedValue([existingAssignment]);

      const result = await service.getUserAssignments('user-1');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        experimentKey: 'checkout',
        variantKey: 'control',
        config: { color: 'blue' },
      });
    });
  });

  // ── createExperiment ────────────────────────────────────────────────────────

  describe('createExperiment', () => {
    const validDto: CreateExperimentDto = {
      key: 'new-experiment',
      name: 'New Experiment',
      description: 'Testing',
      variants: [
        { key: 'control', name: 'Control', weight: 50 },
        { key: 'treatment', name: 'Treatment', weight: 50 },
      ],
    };

    it('should create an experiment with valid variant weights', async () => {
      mockExperimentRepo.findOne.mockResolvedValue(null);
      const createdExperiment = {
        id: 'exp-1',
        key: 'new-experiment',
        status: ExperimentStatus.DRAFT,
      };
      mockExperimentRepo.create.mockReturnValue(createdExperiment);
      mockExperimentRepo.save.mockResolvedValue(createdExperiment);

      const variants = [
        { id: 'v-1', key: 'control', name: 'Control', weight: 50 },
        { id: 'v-2', key: 'treatment', name: 'Treatment', weight: 50 },
      ];
      mockVariantRepo.create.mockImplementation((v) => v);
      mockVariantRepo.save.mockResolvedValue(variants);

      const result = await service.createExperiment(validDto);

      expect(result.key).toBe('new-experiment');
      expect(result.status).toBe(ExperimentStatus.DRAFT);
      expect(mockExperimentRepo.save).toHaveBeenCalled();
      expect(mockVariantRepo.save).toHaveBeenCalled();
    });

    it('should throw ConflictException when experiment key already exists', async () => {
      mockExperimentRepo.findOne.mockResolvedValue({
        id: 'existing',
        key: 'new-experiment',
      });

      await expect(service.createExperiment(validDto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw BadRequestException when variant weights sum to 0', async () => {
      mockExperimentRepo.findOne.mockResolvedValue(null);

      const dtoWithZeroWeights: CreateExperimentDto = {
        key: 'zero-weights',
        name: 'Zero Weights',
        variants: [
          { key: 'a', name: 'A', weight: 0 },
          { key: 'b', name: 'B', weight: 0 },
        ],
      };

      await expect(
        service.createExperiment(dtoWithZeroWeights),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when variant weights sum to negative', async () => {
      mockExperimentRepo.findOne.mockResolvedValue(null);

      const dtoWithNegativeWeights: CreateExperimentDto = {
        key: 'negative-weights',
        name: 'Negative',
        variants: [
          { key: 'a', name: 'A', weight: -10 },
          { key: 'b', name: 'B', weight: 5 },
        ],
      };

      await expect(
        service.createExperiment(dtoWithNegativeWeights),
      ).rejects.toThrow(BadRequestException);
    });

    it('should default trafficPercent to 100 when not provided', async () => {
      mockExperimentRepo.findOne.mockResolvedValue(null);
      mockExperimentRepo.create.mockImplementation((e) => e);
      mockExperimentRepo.save.mockImplementation((e) =>
        Promise.resolve({ ...e, id: 'exp-new', variants: [] }),
      );
      mockVariantRepo.create.mockImplementation((v) => v);
      mockVariantRepo.save.mockResolvedValue([]);

      const dtoNoTraffic: CreateExperimentDto = {
        key: 'no-traffic',
        name: 'No Traffic Specified',
        variants: [{ key: 'a', name: 'A', weight: 100 }],
      };

      const result = await service.createExperiment(dtoNoTraffic);

      expect(mockExperimentRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ trafficPercent: 100 }),
      );
    });

    it('should use provided trafficPercent when specified', async () => {
      mockExperimentRepo.findOne.mockResolvedValue(null);
      mockExperimentRepo.create.mockImplementation((e) => e);
      mockExperimentRepo.save.mockImplementation((e) =>
        Promise.resolve({ ...e, id: 'exp-2', variants: [] }),
      );
      mockVariantRepo.create.mockImplementation((v) => v);
      mockVariantRepo.save.mockResolvedValue([]);

      const dtoWithTraffic: CreateExperimentDto = {
        key: 'partial-traffic',
        name: 'Partial Traffic',
        trafficPercent: 25,
        variants: [{ key: 'a', name: 'A', weight: 100 }],
      };

      await service.createExperiment(dtoWithTraffic);

      expect(mockExperimentRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ trafficPercent: 25 }),
      );
    });

    it('should default variant config to empty object when not provided', async () => {
      mockExperimentRepo.findOne.mockResolvedValue(null);
      mockExperimentRepo.create.mockImplementation((e) => e);
      mockExperimentRepo.save.mockImplementation((e) =>
        Promise.resolve({ ...e, id: 'exp-3', variants: [] }),
      );
      mockVariantRepo.create.mockImplementation((v) => v);
      mockVariantRepo.save.mockResolvedValue([]);

      await service.createExperiment(validDto);

      expect(mockVariantRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ config: {} }),
      );
    });

    it('should preserve provided variant config', async () => {
      mockExperimentRepo.findOne.mockResolvedValue(null);
      mockExperimentRepo.create.mockImplementation((e) => e);
      mockExperimentRepo.save.mockImplementation((e) =>
        Promise.resolve({ ...e, id: 'exp-4', variants: [] }),
      );
      mockVariantRepo.create.mockImplementation((v) => v);
      mockVariantRepo.save.mockResolvedValue([]);

      const dtoWithConfig: CreateExperimentDto = {
        key: 'with-config',
        name: 'With Config',
        variants: [
          {
            key: 'a',
            name: 'A',
            weight: 100,
            config: { color: 'red', fontSize: 14 },
          },
        ],
      };

      await service.createExperiment(dtoWithConfig);

      expect(mockVariantRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ config: { color: 'red', fontSize: 14 } }),
      );
    });
  });

  // ── updateExperiment ────────────────────────────────────────────────────────

  describe('updateExperiment', () => {
    it('should update an existing experiment', async () => {
      const existingExperiment = {
        id: 'exp-1',
        key: 'test',
        name: 'Old Name',
        status: ExperimentStatus.DRAFT,
      };
      mockExperimentRepo.findOne.mockResolvedValue(existingExperiment);
      mockExperimentRepo.save.mockResolvedValue({
        ...existingExperiment,
        name: 'New Name',
      });

      const result = await service.updateExperiment('exp-1', {
        name: 'New Name',
      });

      expect(result.name).toBe('New Name');
    });

    it('should throw NotFoundException when experiment does not exist', async () => {
      mockExperimentRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updateExperiment('nonexistent', { name: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when trying to restart a concluded experiment', async () => {
      mockExperimentRepo.findOne.mockResolvedValue({
        id: 'exp-1',
        status: ExperimentStatus.CONCLUDED,
      });

      await expect(
        service.updateExperiment('exp-1', { status: ExperimentStatus.RUNNING }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow transitioning from PAUSED to RUNNING', async () => {
      const pausedExperiment = {
        id: 'exp-1',
        status: ExperimentStatus.PAUSED,
      };
      mockExperimentRepo.findOne.mockResolvedValue(pausedExperiment);
      mockExperimentRepo.save.mockImplementation((e) => Promise.resolve(e));

      const result = await service.updateExperiment('exp-1', {
        status: ExperimentStatus.RUNNING,
      });

      expect(result.status).toBe(ExperimentStatus.RUNNING);
    });

    it('should allow transitioning from DRAFT to RUNNING', async () => {
      const draftExperiment = {
        id: 'exp-1',
        status: ExperimentStatus.DRAFT,
      };
      mockExperimentRepo.findOne.mockResolvedValue(draftExperiment);
      mockExperimentRepo.save.mockImplementation((e) => Promise.resolve(e));

      const result = await service.updateExperiment('exp-1', {
        status: ExperimentStatus.RUNNING,
      });

      expect(result.status).toBe(ExperimentStatus.RUNNING);
    });

    it('should allow updating trafficPercent', async () => {
      mockExperimentRepo.findOne.mockResolvedValue({
        id: 'exp-1',
        status: ExperimentStatus.RUNNING,
        trafficPercent: 100,
      });
      mockExperimentRepo.save.mockImplementation((e) => Promise.resolve(e));

      const result = await service.updateExperiment('exp-1', {
        trafficPercent: 50,
      });

      expect(result.trafficPercent).toBe(50);
    });
  });

  // ── listExperiments ─────────────────────────────────────────────────────────

  describe('listExperiments', () => {
    it('should return all experiments ordered by createdAt DESC', async () => {
      const experiments = [
        { id: 'exp-2', name: 'Second' },
        { id: 'exp-1', name: 'First' },
      ];
      mockExperimentRepo.find.mockResolvedValue(experiments);

      const result = await service.listExperiments();

      expect(mockExperimentRepo.find).toHaveBeenCalledWith({
        relations: ['variants'],
        order: { createdAt: 'DESC' },
      });
      expect(result).toEqual(experiments);
    });
  });

  // ── getExperimentResults ────────────────────────────────────────────────────

  describe('getExperimentResults', () => {
    it('should throw NotFoundException when experiment does not exist', async () => {
      mockExperimentRepo.findOne.mockResolvedValue(null);

      await expect(service.getExperimentResults('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return variant results with conversion rates', async () => {
      const experiment = {
        id: 'exp-1',
        key: 'test',
        variants: [
          { id: 'v-1', key: 'control', name: 'Control' },
          { id: 'v-2', key: 'treatment', name: 'Treatment' },
        ],
      };
      mockExperimentRepo.findOne.mockResolvedValue(experiment);
      mockAssignmentRepo.count
        .mockResolvedValueOnce(100) // control
        .mockResolvedValueOnce(100); // treatment

      // Mock createQueryBuilder for events
      const mockQb = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest
          .fn()
          .mockResolvedValue([{ eventName: 'click', count: '20' }]),
      };
      mockEventRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.getExperimentResults('exp-1');

      expect(result.experiment).toBe(experiment);
      expect(result.variants).toHaveLength(2);
      expect(result.significance).toBeDefined();
    });

    it('should handle zero assignment count (conversion rate = 0)', async () => {
      const experiment = {
        id: 'exp-1',
        variants: [
          { id: 'v-1', key: 'control', name: 'Control' },
          { id: 'v-2', key: 'treatment', name: 'Treatment' },
        ],
      };
      mockExperimentRepo.findOne.mockResolvedValue(experiment);
      mockAssignmentRepo.count.mockResolvedValue(0);

      const mockQb = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };
      mockEventRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.getExperimentResults('exp-1');

      expect(result.variants[0].conversionRate).toBe(0);
    });

    it('should compute p-values for significance testing', async () => {
      const experiment = {
        id: 'exp-1',
        variants: [
          { id: 'v-1', key: 'control', name: 'Control' },
          { id: 'v-2', key: 'treatment', name: 'Treatment' },
        ],
      };
      mockExperimentRepo.findOne.mockResolvedValue(experiment);
      // Control: 100 assignments, 10 conversions; Treatment: 100 assignments, 30 conversions
      mockAssignmentRepo.count
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(100);

      const mockQb = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest
          .fn()
          .mockResolvedValueOnce([{ eventName: 'convert', count: '10' }]) // control
          .mockResolvedValueOnce([{ eventName: 'convert', count: '30' }]), // treatment
      };
      mockEventRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.getExperimentResults('exp-1');

      expect(result.significance).toHaveLength(1);
      expect(result.significance[0].controlKey).toBe('control');
      expect(result.significance[0].variantKey).toBe('treatment');
      expect(result.significance[0].pValue).toBeGreaterThanOrEqual(0);
      expect(result.significance[0].pValue).toBeLessThanOrEqual(1);
      expect(typeof result.significance[0].significant).toBe('boolean');
    });
  });
});
