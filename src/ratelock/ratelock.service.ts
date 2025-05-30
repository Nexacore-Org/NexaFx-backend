import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RateLock } from './entities/ratelock.entity';
import { Repository } from 'typeorm';

@Injectable()
export class RateLockService {
  constructor(
    @InjectRepository(RateLock)
    private rateLockRepo: Repository<RateLock>,
  ) {}

  async findById(id: number): Promise<RateLock | null> {
    return this.rateLockRepo.findOne({ where: { id } });
  }

  async isExpired(id: number): Promise<boolean> {
    const rateLock = await this.findById(id);
    if (!rateLock) return true;
    return new Date(rateLock.expiresAt) < new Date();
  }
}

