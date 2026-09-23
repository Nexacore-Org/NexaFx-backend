import { Test, TestingModule } from '@nestjs/testing';
import {
  CorridorsPublicController,
  CorridorsAdminController,
} from './corridors.controller';
import { CorridorsService } from './corridors.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

const mockCorridorsService = {
  discoverCorridors: jest.fn(),
  createCorridor: jest.fn(),
  listCorridors: jest.fn(),
  updateCorridor: jest.fn(),
};

describe('CorridorsPublicController', () => {
  let controller: CorridorsPublicController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CorridorsPublicController],
      providers: [
        { provide: CorridorsService, useValue: mockCorridorsService },
      ],
    }).compile();

    controller = module.get<CorridorsPublicController>(
      CorridorsPublicController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('discoverCorridors', () => {
    it('should call corridorsService.discoverCorridors', async () => {
      await controller.discoverCorridors('USD', 'NGN', '100');
      expect(mockCorridorsService.discoverCorridors).toHaveBeenCalledWith(
        'USD',
        'NGN',
        100,
        undefined,
      );
    });
  });
});

describe('CorridorsAdminController', () => {
  let controller: CorridorsAdminController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CorridorsAdminController],
      providers: [
        { provide: CorridorsService, useValue: mockCorridorsService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CorridorsAdminController>(CorridorsAdminController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createCorridor', () => {
    it('should call corridorsService.createCorridor', async () => {
      const body = {};
      await controller.createCorridor(body);
      expect(mockCorridorsService.createCorridor).toHaveBeenCalledWith(body);
    });
  });

  describe('listCorridors', () => {
    it('should call corridorsService.listCorridors', async () => {
      await controller.listCorridors();
      expect(mockCorridorsService.listCorridors).toHaveBeenCalled();
    });
  });

  describe('updateCorridor', () => {
    it('should call corridorsService.updateCorridor', async () => {
      const body = {};
      await controller.updateCorridor('corridor-id', body);
      expect(mockCorridorsService.updateCorridor).toHaveBeenCalledWith(
        'corridor-id',
        body,
      );
    });
  });
});
