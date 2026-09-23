import { Test, TestingModule } from '@nestjs/testing';
import { ReferralsController } from './referrals.controller';
import { ReferralsService } from './referrals.service';

describe('ReferralsController', () => {
  let controller: ReferralsController;
  let service: ReferralsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReferralsController],
      providers: [
        {
          provide: ReferralsService,
          useValue: {
            getReferralStats: jest.fn(),
            getUserReferrals: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<ReferralsController>(ReferralsController);
    service = module.get<ReferralsService>(ReferralsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getStats', () => {
    it('should call referralsService.getReferralStats with the correct userId', async () => {
      const req = { user: { userId: 'user1' } };
      await controller.getStats(req);
      expect(service.getReferralStats).toHaveBeenCalledWith('user1');
    });
  });

  describe('getMyReferrals', () => {
    it('should call referralsService.getUserReferrals with the correct userId', async () => {
      const req = { user: { userId: 'user1' } };
      await controller.getMyReferrals(req);
      expect(service.getUserReferrals).toHaveBeenCalledWith('user1');
    });
  });
});
