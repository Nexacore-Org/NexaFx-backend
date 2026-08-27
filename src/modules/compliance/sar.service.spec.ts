import { Test, TestingModule } from '@nestjs/testing';
import { SarService } from './sar.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Sar } from './entities/sar.entity';

const mockSarRepo = {
  findOne: jest.fn(),
  createQueryBuilder: jest.fn(),
  count: jest.fn(),
};

describe('SarService', () => {
  let service: SarService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SarService,
        {
          provide: getRepositoryToken(Sar),
          useValue: mockSarRepo,
        },
      ],
    }).compile();

    service = module.get<SarService>(SarService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findByFlagId', () => {
    it('should return a SAR for a given flag ID', async () => {
      const sar = { id: 'sar-id', flagId: 'flag-id' };
      mockSarRepo.findOne.mockResolvedValue(sar);
      const result = await service.findByFlagId('flag-id');
      expect(result).toEqual(sar);
    });
  });

  describe('findByDateRange', () => {
    it('should return SARs within a date range', async () => {
      const sars = [{ id: 'sar-id' }];
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(sars),
      };
      mockSarRepo.createQueryBuilder.mockReturnValue(queryBuilder);
      const result = await service.findByDateRange(new Date(), new Date());
      expect(result).toEqual(sars);
    });
  });

  describe('countFiledThisMonth', () => {
    it('should return the count of SARs filed this month', async () => {
      mockSarRepo.count.mockResolvedValue(5);
      const result = await service.countFiledThisMonth();
      expect(result).toEqual(5);
    });
  });
});
