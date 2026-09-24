import { Module } from '@nestjs/common';
import { LoadTestingController } from './load-testing.controller';
import { LoadTestingService } from './load-testing.service';

@Module({
  controllers: [LoadTestingController],
  providers: [LoadTestingService],
  exports: [LoadTestingService],
})
export class LoadTestingModule {}
