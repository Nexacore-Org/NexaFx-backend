import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RateLock } from './entities/ratelock.entity';
import { Repository } from 'typeorm';
import { UpdateRatelockDto } from './dto/update-ratelock.dto';
import { CreateRatelockDto } from './dto/create-ratelock.dto';

@Injectable()
export class RateLockService {
  create(createRatelockDto: CreateRatelockDto) {
    throw new Error('Method not implemented.');
  }
  findAll() {
    throw new Error('Method not implemented.');
  }
  findOne(arg0: number) {
    throw new Error('Method not implemented.');
  }
  remove(arg0: number) {
    throw new Error('Method not implemented.');
  }
  update(arg0: number, updateRatelockDto: UpdateRatelockDto) {
    throw new Error('Method not implemented.');
  }
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

