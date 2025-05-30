import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RateLockEntity } from './rate-locks.entity';
import { RateLocksService } from './rate-locks.service';

@Module({
  imports: [TypeOrmModule.forFeature([RateLockEntity])],
  providers: [RateLocksService],
  exports: [RateLocksService],
})
export class RateLocksModule {}
