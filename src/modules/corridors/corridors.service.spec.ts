import { Test, TestingModule } from '@nestjs/testing';
import { CorridorsService } from './corridors.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PaymentCorridor } from './entities/payment-corridor.entity';
import { getRedisToken } from '@nestjs-modules/ioredis';

const mockCorridorRepo = {
  createQueryBuilder: jest.fn(() => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  })),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
};

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
};

describe('CorridorsService', () => {
  let service: CorridorsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CorridorsService,
        {
          provide: getRepositoryToken(PaymentCorridor),
          useValue: mockCorridorRepo,
        },
        {
          provide: getRedisToken('default'),
          useValue: mockRedis,
        },
      ],
    }).compile();

    service = module.get<CorridorsService>(CorridorsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('discoverCorridors', () => {
    it('should return corridors from the database', async () => {
      const corridors = [{ id: 'corridor-id' }];
      mockRedis.get.mockResolvedValue(null);
      mockCorridorRepo
        .createQueryBuilder()
        .getMany.mockResolvedValue(corridors);
      const result = await service.discoverCorridors('USD', 'NGN', 100);
      expect(result).toEqual(corridors);
      expect(mockRedis.set).toHaveBeenCalled();
    });

    it('should return corridors from the cache', async () => {
      const corridors = [{ id: 'corridor-id' }];
      mockRedis.get.mockResolvedValue(JSON.stringify(corridors));
      const result = await service.discoverCorridors('USD', 'NGN', 100);
      expect(result).toEqual(corridors);
      expect(
        mockCorridorRepo.createQueryBuilder().getMany,
      ).not.toHaveBeenCalled();
    });
  });

  describe('validateCorridor', () => {
    it('should return valid for a valid corridor and user', async () => {
      const corridor = {
        id: 'corridor-id',
        isActive: true,
        minAmount: '50',
        maxAmount: '500',
        requiredKycTier: 'BASIC',
      };
      mockCorridorRepo.findOne.mockResolvedValue(corridor);
      const result = await service.validateCorridor(
        'corridor-id',
        'ENHANCED',
        100,
      );
      expect(result.valid).toBe(true);
    });

    it('should return invalid for an inactive corridor', async () => {
      const corridor = { id: 'corridor-id', isActive: false };
      mockCorridorRepo.findOne.mockResolvedValue(corridor);
      const result = await service.validateCorridor(
        'corridor-id',
        'BASIC',
        100,
      );
      expect(result.valid).toBe(false);
    });

    it('should return invalid for an amount below the minimum', async () => {
      const corridor = {
        id: 'corridor-id',
        isActive: true,
        minAmount: '150',
        maxAmount: '500',
      };
      mockCorridorRepo.findOne.mockResolvedValue(corridor);
      const result = await service.validateCorridor(
        'corridor-id',
        'BASIC',
        100,
      );
      expect(result.valid).toBe(false);
    });

    it('should return invalid for a kyc tier that is too low', async () => {
      const corridor = {
        id: 'corridor-id',
        isActive: true,
        minAmount: '50',
        maxAmount: '500',
        requiredKycTier: 'ENHANCED',
      };
      mockCorridorRepo.findOne.mockResolvedValue(corridor);
      const result = await service.validateCorridor(
        'corridor-id',
        'BASIC',
        100,
      );
      expect(result.valid).toBe(false);
    });
  });
});
