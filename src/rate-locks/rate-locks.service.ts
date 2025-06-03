import { Injectable, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { RateLockEntity } from './rate-locks.entity';

@Injectable()
export class RateLocksService {
  constructor(
    @InjectRepository(RateLockEntity)
    private readonly rateLockRepository: Repository<RateLockEntity>,
  ) {}

  private static LOCK_DURATION_MS = 5 * 60 * 1000; // 5 minutes

  async createRateLock(userId: string, pair: string, lockedRate: number): Promise<RateLockEntity> {
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
      throw new ConflictException('Active rate lock already exists for this user and currency pair.');
    }

    const expiresAt = new Date(now.getTime() + RateLocksService.LOCK_DURATION_MS);

    const rateLock = this.rateLockRepository.create({
      userId,
      pair,
      lockedRate,
      expiresAt,
    });

    return this.rateLockRepository.save(rateLock);
  }

  async getActiveRateLock(userId: string, pair: string): Promise<RateLockEntity | null> {
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

  async validateRateLock(userId: string, pair: string, lockedRate: number): Promise<boolean> {
    const lock = await this.getActiveRateLock(userId, pair);
    if (!lock) return false;
    return Number(lock.lockedRate) === Number(lockedRate);
  }
}
