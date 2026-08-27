import { Test, TestingModule } from '@nestjs/testing';
import { RebalancingController } from './rebalancing.controller';
import { RebalancingService } from './rebalancing.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

describe('RebalancingController', () => {
  let controller: RebalancingController;
  let service: RebalancingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RebalancingController],
      providers: [
        {
          provide: RebalancingService,
          useValue: {
            getPolicy: jest.fn(),
            upsertPolicy: jest.fn(),
            deactivatePolicy: jest.fn(),
            calculateTrades: jest.fn(),
            execute: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<RebalancingController>(RebalancingController);
    service = module.get<RebalancingService>(RebalancingService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getPolicy', () => {
    it('should call rebalancingService.getPolicy with the correct userId', async () => {
      const req = { user: { id: 'user1' } };
      await controller.getPolicy(req);
      expect(service.getPolicy).toHaveBeenCalledWith('user1');
    });
  });

  describe('upsertPolicy', () => {
    it('should call rebalancingService.upsertPolicy with the correct userId and dto', async () => {
      const req = { user: { id: 'user1' } };
      const dto = {} as any;
      await controller.upsertPolicy(req, dto);
      expect(service.upsertPolicy).toHaveBeenCalledWith('user1', dto);
    });
  });

  describe('deactivatePolicy', () => {
    it('should call rebalancingService.deactivatePolicy with the correct userId', async () => {
      const req = { user: { id: 'user1' } };
      await controller.deactivatePolicy(req);
      expect(service.deactivatePolicy).toHaveBeenCalledWith('user1');
    });
  });

  describe('preview', () => {
    it('should call rebalancingService.calculateTrades with the correct userId', async () => {
      const req = { user: { id: 'user1' } };
      await controller.preview(req);
      expect(service.calculateTrades).toHaveBeenCalledWith('user1');
    });
  });

  describe('execute', () => {
    it('should call rebalancingService.execute with the correct userId', async () => {
      const req = { user: { id: 'user1' } };
      await controller.execute(req);
      expect(service.execute).toHaveBeenCalledWith('user1');
    });
  });
});
