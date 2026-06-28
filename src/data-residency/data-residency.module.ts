import { Module } from '@nestjs/common';
import { DataResidencyController } from './data-residency.controller';
import { DataResidencyService } from './data-residency.service';

@Module({
  controllers: [DataResidencyController],
  providers: [DataResidencyService],
  exports: [DataResidencyService],
})
export class DataResidencyModule {}
