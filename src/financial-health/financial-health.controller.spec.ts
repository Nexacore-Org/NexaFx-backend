import { Test, TestingModule } from '@nestjs/testing';
import { FinancialHealthController } from './financial-health.controller';
import { FinancialHealthService } from './financial-health.service';
// Manual mock prevents ts-jest from transpiling the real service
jest.mock('./financial-health.service', () => ({
  FinancialHealthService: jest.fn().mockImplementation(() => ({})),
}));

describe('FinancialHealthController', () => {
  let controller: FinancialHealthController;

  const mockService = {
    getLatestScore: jest.fn(),
    calculateAndSaveScore: jest.fn(),
    getHistory: jest.fn(),
  };

  const mockReq = { user: { id: 'user-1' } };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FinancialHealthController],
      providers: [{ provide: FinancialHealthService, useValue: mockService }],
    }).compile();

    controller = module.get<FinancialHealthController>(
      FinancialHealthController,
    );
  });

  describe('getHealthScore', () => {
    it('should return existing score when one exists', async () => {
      const existingScore = { id: 'score-1', userId: 'user-1', score: 72 };
      mockService.getLatestScore.mockResolvedValue(existingScore);

      const result = await controller.getHealthScore(mockReq);

      expect(mockService.getLatestScore).toHaveBeenCalledWith('user-1');
      expect(mockService.calculateAndSaveScore).not.toHaveBeenCalled();
      expect(result).toEqual(existingScore);
    });

    it('should lazy-initialize and calculate score when none exists', async () => {
      mockService.getLatestScore.mockResolvedValue(null);
      const newScore = { id: 'score-2', userId: 'user-1', score: 65 };
      mockService.calculateAndSaveScore.mockResolvedValue(newScore);

      const result = await controller.getHealthScore(mockReq);

      expect(mockService.getLatestScore).toHaveBeenCalledWith('user-1');
      expect(mockService.calculateAndSaveScore).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(newScore);
    });

    it('should forward the user ID from the request object', async () => {
      mockService.getLatestScore.mockResolvedValue(null);
      mockService.calculateAndSaveScore.mockResolvedValue({ score: 50 });

      await controller.getHealthScore({ user: { id: 'user-99' } });

      expect(mockService.getLatestScore).toHaveBeenCalledWith('user-99');
      expect(mockService.calculateAndSaveScore).toHaveBeenCalledWith('user-99');
    });
  });

  describe('getHistory', () => {
    it('should return history with default 12 weeks', async () => {
      const scores = [{ score: 72 }, { score: 60 }];
      mockService.getHistory.mockResolvedValue(scores);

      const result = await controller.getHistory(mockReq);

      expect(mockService.getHistory).toHaveBeenCalledWith('user-1', 12);
      expect(result).toEqual(scores);
    });

    it('should forward the weeks query parameter', async () => {
      mockService.getHistory.mockResolvedValue([]);

      const result = await controller.getHistory(mockReq, 6);

      expect(mockService.getHistory).toHaveBeenCalledWith('user-1', 6);
    });

    it('should default weeks to 12 when not provided', async () => {
      mockService.getHistory.mockResolvedValue([]);

      const result = await controller.getHistory(mockReq);

      expect(mockService.getHistory).toHaveBeenCalledWith('user-1', 12);
    });

    it('should return empty array when no history exists', async () => {
      mockService.getHistory.mockResolvedValue([]);

      const result = await controller.getHistory(mockReq, 4);

      expect(result).toEqual([]);
    });
  });
});
