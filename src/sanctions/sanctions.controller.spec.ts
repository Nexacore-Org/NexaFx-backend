import { Test, TestingModule } from '@nestjs/testing';
import { SanctionsController } from './sanctions.controller';
import { SanctionsService } from './sanctions.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

describe('SanctionsController', () => {
  let controller: SanctionsController;
  let service: SanctionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SanctionsController],
      providers: [
        {
          provide: SanctionsService,
          useValue: {
            getLatestScreening: jest.fn(),
            listScreenings: jest.fn(),
            overrideScreening: jest.fn(),
            screenUser: jest.fn(),
            syncOfacList: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SanctionsController>(SanctionsController);
    service = module.get<SanctionsService>(SanctionsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getMyScreening', () => {
    it('should call sanctionsService.getLatestScreening with the correct userId', async () => {
      const req = { user: { userId: 'user1' } };
      await controller.getMyScreening(req as any);
      expect(service.getLatestScreening).toHaveBeenCalledWith('user1');
    });
  });

  describe('listScreenings', () => {
    it('should call sanctionsService.listScreenings with the correct parameters', async () => {
      await controller.listScreenings(ScreeningStatus.BLOCKED, 2, 50);
      expect(service.listScreenings).toHaveBeenCalledWith(
        ScreeningStatus.BLOCKED,
        2,
        50,
      );
    });
  });

  describe('overrideScreening', () => {
    it('should call sanctionsService.overrideScreening with the correct parameters', async () => {
      const req = { user: { userId: 'admin1' } };
      const dto = { reason: 'test reason' };
      await controller.overrideScreening('screening1', dto, req as any);
      expect(service.overrideScreening).toHaveBeenCalledWith(
        'screening1',
        'admin1',
        'test reason',
      );
    });
  });

  describe('screenUser', () => {
    it('should call sanctionsService.screenUser with the correct userId', async () => {
      await controller.screenUser('user1');
      expect(service.screenUser).toHaveBeenCalledWith('user1');
    });
  });

  describe('syncOfac', () => {
    it('should call sanctionsService.syncOfacList', async () => {
      await controller.syncOfac();
      expect(service.syncOfacList).toHaveBeenCalled();
    });
  });
});
