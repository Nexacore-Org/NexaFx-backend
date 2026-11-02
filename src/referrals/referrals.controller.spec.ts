jest.mock('@nestjs/swagger', () => {
  const noop = () => () => {};
  return {
    ApiProperty: noop,
    ApiPropertyOptional: noop,
    ApiTags: noop,
    ApiBearerAuth: noop,
    ApiOperation: noop,
    ApiResponse: noop,
    ApiQuery: noop,
  };
});

jest.mock('./referrals.service', () => ({
  ReferralsService: class ReferralsService {},
}));

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ReferralsController } from './referrals.controller';
import { ReferralsService } from './referrals.service';

describe('ReferralsController (#1474)', () => {
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

    it('passes validated pagination query params and rejects limit > 100', async () => {
      const req = { user: { userId: 'user1' } };
      await controller.getMyReferrals(req, { page: 2, limit: 25 });
      expect(service.getUserReferrals).toHaveBeenCalledWith('user1', 2, 25);

      await expect(
        controller.getMyReferrals(req, { page: 1, limit: 150 }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
