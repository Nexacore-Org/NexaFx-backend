import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RateLock } from './entities/ratelock.entity'; 
import { RateLockService } from './ratelock.service'; 
import { RatelockController } from './ratelock.controller'; 

@Module({
  imports: [TypeOrmModule.forFeature([RateLock])],
  providers: [RateLockService],
  controllers: [RatelockController],
  exports: [RateLockService],
})
export class RateLockModule {}
