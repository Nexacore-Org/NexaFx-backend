import { Test, TestingModule } from '@nestjs/testing';
import { VolumeFeeTiersController } from './volume-fee-tiers.controller';
import { VolumeFeeTiersService } from './volume-fee-tiers.service';
import { VolumeFeeTier } from './entities/volume-fee-tier.entity';

describe('VolumeFeeTiersController', () => {
  let controller: VolumeFeeTiersController;

  const mockListActive = jest.fn();

  const makeTier = (name: string, minVolume: string): VolumeFeeTier => ({
    id: 'uuid',
    name,
    minVolume30dUsd: minVolume,
    sendFeePercent: '0.0010',
    exchangeFeePercent: '0.0015',
    maxSendFee: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  beforeEach(async () => {
    mockListActive.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VolumeFeeTiersController],
      providers: [
        {
          provide: VolumeFeeTiersService,
          useValue: { listActive: mockListActive },
        },
      ],
    }).compile();

    controller = module.get<VolumeFeeTiersController>(VolumeFeeTiersController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('list', () => {
    it('should delegate to service.listActive()', async () => {
      const tiers = [makeTier('Bronze', '0'), makeTier('Silver', '10000')];
      mockListActive.mockResolvedValue(tiers);

      const result = await controller.list();

      expect(mockListActive).toHaveBeenCalledTimes(1);
      expect(result).toEqual(tiers);
    });

    it('should return an empty array when no active tiers exist', async () => {
      mockListActive.mockResolvedValue([]);

      const result = await controller.list();

      expect(result).toEqual([]);
    });
  });
});
