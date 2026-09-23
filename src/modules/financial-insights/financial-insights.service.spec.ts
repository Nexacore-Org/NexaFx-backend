import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { FinancialInsightsService } from './financial-insights.service';
import { FinancialInsight } from './entities/financial-insight.entity';
import { mock, DeepMockProxy } from 'jest-mock-extended';

describe('FinancialInsightsService', () => {
  let service: FinancialInsightsService;
  let insightRepo: DeepMockProxy<ReturnType<typeof mockInsightRepo>>;

  const mockInsightRepo = () => ({
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FinancialInsightsService,
        {
          provide: getRepositoryToken(FinancialInsight),
          useFactory: mockInsightRepo,
        },
      ],
    }).compile();

    service = module.get<FinancialInsightsService>(FinancialInsightsService);
    insightRepo = module.get(getRepositoryToken(FinancialInsight));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('upsertWeekly', () => {
    it('should create a new insight if one does not exist', async () => {
      const userId = 'user-1';
      const weekOf = '2024-01-01';
      const insights = [{ type: 'test', message: 'Test message' }];

      insightRepo.findOne.mockResolvedValue(null);
      insightRepo.create.mockImplementation((i) => i as any);
      insightRepo.save.mockImplementation((i) => Promise.resolve(i as any));

      const result = await service.upsertWeekly(userId, weekOf, insights);

      expect(result.userId).toBe(userId);
      expect(result.weekOf).toBe(weekOf);
      expect(result.insights).toEqual(insights);
      expect(insightRepo.create).toHaveBeenCalled();
      expect(insightRepo.save).toHaveBeenCalled();
    });

    it('should update an existing insight', async () => {
      const userId = 'user-1';
      const weekOf = '2024-01-01';
      const existingInsight = {
        userId,
        weekOf,
        insights: [],
        insightTypes: [],
      } as FinancialInsight;
      const newInsights = [{ type: 'test', message: 'New message' }];

      insightRepo.findOne.mockResolvedValue(existingInsight);
      insightRepo.save.mockImplementation((i) => Promise.resolve(i as any));

      const result = await service.upsertWeekly(userId, weekOf, newInsights);

      expect(result.insights).toEqual(newInsights);
      expect(insightRepo.create).not.toHaveBeenCalled();
      expect(insightRepo.save).toHaveBeenCalledWith(existingInsight);
    });

    it('should not create duplicate insights for the same week', async () => {
      const userId = 'user-1';
      const weekOf = '2024-01-01';
      const insights = [{ type: 'test', message: 'Test message' }];
      const existingInsight = {
        userId,
        weekOf,
        insights,
        insightTypes: ['test'],
      } as FinancialInsight;

      insightRepo.findOne.mockResolvedValue(existingInsight);
      insightRepo.save.mockImplementation((i) => Promise.resolve(i as any));

      await service.upsertWeekly(userId, weekOf, insights);

      expect(insightRepo.create).not.toHaveBeenCalled();
      expect(insightRepo.save).toHaveBeenCalledWith(existingInsight);
    });
  });

  describe('getForUser', () => {
    it('should return insights for a user', async () => {
      const userId = 'user-1';
      const insights = [
        { userId, weekOf: '2024-01-01', insights: [] },
      ] as FinancialInsight[];
      insightRepo.find.mockResolvedValue(insights);

      const result = await service.getForUser(userId);

      expect(result).toEqual(insights);
      expect(insightRepo.find).toHaveBeenCalledWith({
        where: { userId },
        order: { generatedAt: 'DESC' },
      });
    });
  });
});
