import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RateLock } from './entities/ratelock.entity';
import { RateLocksService } from './rate-locks.service';
import { RateLocksController } from './ratelock.controller';

@Module({
  imports: [TypeOrmModule.forFeature([RateLock])],
  providers: [RateLocksService],
  controllers: [RateLocksController],
  exports: [RateLocksService],
})
export class RateLockModule {}
