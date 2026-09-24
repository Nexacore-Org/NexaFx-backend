import { Test, TestingModule } from '@nestjs/testing';
import { SavingsRecommendationsController } from './savings-recommendations.controller';
import { SavingsRecommendationsService } from './savings-recommendations.service';

describe('SavingsRecommendationsController', () => {
  let controller: SavingsRecommendationsController;
  let recommendationsService: any;

  beforeEach(async () => {
    recommendationsService = {
      getRecommendations: jest.fn(),
      markActedOn: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SavingsRecommendationsController],
      providers: [
        {
          provide: SavingsRecommendationsService,
          useValue: recommendationsService,
        },
      ],
    }).compile();

    controller = module.get<SavingsRecommendationsController>(
      SavingsRecommendationsController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getRecommendations', () => {
    it('scopes recommendations to the requesting user id only', async () => {
      recommendationsService.getRecommendations.mockResolvedValue([
        { id: 'rec-1' },
      ]);

      const result = await controller.getRecommendations({
        user: { id: 'user-1' },
      } as any);

      expect(recommendationsService.getRecommendations).toHaveBeenCalledWith(
        'user-1',
      );
      expect(result).toEqual([{ id: 'rec-1' }]);
    });
  });

  describe('markActedOn', () => {
    it('marks the recommendation as acted on for the requesting user', async () => {
      recommendationsService.markActedOn.mockResolvedValue({
        id: 'rec-1',
        isActedOn: true,
      });

      const result = await controller.markActedOn('rec-1', {
        user: { id: 'user-1' },
      } as any);

      expect(recommendationsService.markActedOn).toHaveBeenCalledWith(
        'rec-1',
        'user-1',
      );
      expect(result.isActedOn).toBe(true);
    });
  });
});
