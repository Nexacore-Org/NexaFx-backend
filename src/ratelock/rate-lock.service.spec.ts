import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RateLockEntity } from '../rate-locks/rate-locks.entity';
import { RateLocksService } from './rate-locks.service';
import { Repository } from 'typeorm';
import { ConflictException } from '@nestjs/common';
import { DeepPartial } from 'typeorm';

describe('RateLocksService', () => {
  let service: RateLocksService;
  let repo: Repository<RateLockEntity>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLocksService,
        {
          provide: getRepositoryToken(RateLockEntity),
          useClass: Repository,
        },
      ],
    }).compile();

    service = module.get<RateLocksService>(RateLocksService);
    repo = module.get<Repository<RateLockEntity>>(
      getRepositoryToken(RateLockEntity),
    );
  });

  describe('createRateLock', () => {
    it('should throw if active lock exists', async () => {
      jest.spyOn(repo, 'findOne').mockResolvedValueOnce({} as RateLockEntity);
      await expect(
        service.createRateLock('user1', 'USD/EUR', 1.1),
      ).rejects.toThrow(ConflictException);
    });

    it('should create a new rate lock', async () => {
      jest.spyOn(repo, 'findOne').mockResolvedValueOnce(null);
      const saveSpy = jest
        .spyOn(repo, 'save')
        .mockImplementation(
          async (entity: DeepPartial<RateLockEntity>) =>
            entity as RateLockEntity,
        );

      const result = await service.createRateLock('user1', 'USD/EUR', 1.1);
      expect(saveSpy).toHaveBeenCalled();
      expect(result.userId).toBe('user1');
      expect(result.pair).toBe('USD/EUR');
      expect(result.lockedRate).toBe(1.1);
    });
  });

  describe('validateRateLock', () => {
    it('should return false if no active lock', async () => {
      jest.spyOn(service, 'getActiveRateLock').mockResolvedValueOnce(null);
      const valid = await service.validateRateLock('user1', 'USD/EUR', 1.1);
      expect(valid).toBe(false);
    });

    it('should return true if lock matches', async () => {
      jest.spyOn(service, 'getActiveRateLock').mockResolvedValueOnce({
        lockedRate: 1.1,
      } as RateLockEntity);
      const valid = await service.validateRateLock('user1', 'USD/EUR', 1.1);
      expect(valid).toBe(true);
    });
  });
});
