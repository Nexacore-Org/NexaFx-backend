import { Injectable, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, LessThan } from 'typeorm';
import { RateLock } from './entities/ratelock.entity';

@Injectable()
export class RateLocksService {
  constructor(
    @InjectRepository(RateLock)
    private readonly rateLockRepository: Repository<RateLock>,
  ) {}

  private static LOCK_DURATION_MS = 5 * 60 * 1000; // 5 minutes

  async createRateLock(
    userId: string,
    pair: string,
    lockedRate: number,
  ): Promise<RateLock> {
    const now = new Date();

    // Check for existing active lock
    const existingLock = await this.rateLockRepository.findOne({
      where: {
        userId,
        pair,
        expiresAt: MoreThan(now),
      },
    });

    if (existingLock) {
      throw new ConflictException(
        'Active rate lock already exists for this user and currency pair.',
      );
    }

    const expiresAt = new Date(
      now.getTime() + RateLocksService.LOCK_DURATION_MS,
    );

    const rateLock = this.rateLockRepository.create({
      userId,
      pair,
      lockedRate,
      expiresAt,
    });

    return this.rateLockRepository.save(rateLock);
  }

  async getActiveRateLock(
    userId: string,
    pair: string,
  ): Promise<RateLock | null> {
    const now = new Date();
    return this.rateLockRepository.findOne({
      where: {
        userId,
        pair,
        expiresAt: MoreThan(now),
      },
      order: { expiresAt: 'DESC' },
    });
  }

  async validateRateLock(
    userId: string,
    pair: string,
    lockedRate: number,
  ): Promise<boolean> {
    const lock = await this.getActiveRateLock(userId, pair);
    if (!lock) return false;
    return Number(lock.lockedRate) === Number(lockedRate);
  }

  async isExpired(id: string): Promise<boolean> {
    const rateLock = await this.findById(id);
    if (!rateLock) return true;
    return new Date(rateLock.expiresAt) < new Date();
  }

  async findById(id: string): Promise<RateLock | null> {
    return this.rateLockRepository.findOne({ where: { id } });
  }

  async removeExpiredLocks(): Promise<void> {
    await this.rateLockRepository.delete({
      expiresAt: LessThan(new Date()),
    });
  }

  async cleanupExpiredLocks(beforeDate: Date): Promise<number> {
    const result = await this.rateLockRepository.delete({
      expiresAt: LessThan(beforeDate),
    });
    return result.affected || 0;
  }
}
