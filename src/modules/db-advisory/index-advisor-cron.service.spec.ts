import { Test, TestingModule } from '@nestjs/testing';
import { IndexAdvisorCronService } from './index-advisor-cron.service';
import { IndexAdvisorService } from './index-advisor.service';
import { mock, DeepMockProxy } from 'jest-mock-extended';

describe('IndexAdvisorCronService', () => {
  let cronService: IndexAdvisorCronService;
  let indexAdvisorService: DeepMockProxy<IndexAdvisorService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IndexAdvisorCronService,
        {
          provide: IndexAdvisorService,
          useValue: mock<IndexAdvisorService>(),
        },
      ],
    }).compile();

    cronService = module.get<IndexAdvisorCronService>(IndexAdvisorCronService);
    indexAdvisorService = module.get(IndexAdvisorService);
  });

  it('should be defined', () => {
    expect(cronService).toBeDefined();
  });

  describe('handleWeeklyAnalysis', () => {
    it('should call the index advisor service to perform analysis', async () => {
      indexAdvisorService.analyse.mockResolvedValue({
        missingIndexes: [],
        unusedIndexes: [],
        slowQueries: [],
      } as any);

      await cronService.handleWeeklyAnalysis();

      expect(indexAdvisorService.analyse).toHaveBeenCalled();
    });

    it('should not run analysis if one is already in progress', async () => {
      // Manually set the isRunning flag to simulate an ongoing analysis
      (cronService as any).isRunning = true;

      await cronService.handleWeeklyAnalysis();

      expect(indexAdvisorService.analyse).not.toHaveBeenCalled();
    });

    it('should handle errors during analysis gracefully', async () => {
      indexAdvisorService.analyse.mockRejectedValue(new Error('Test Error'));

      // We expect the method to not throw an error, but to log it.
      // We can't directly test the logger output here without more complex setup,
      // but we can ensure the promise resolves and doesn't crash the process.
      await expect(cronService.handleWeeklyAnalysis()).resolves.not.toThrow();
    });
  });
});
