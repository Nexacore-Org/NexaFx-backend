import { Module } from '@nestjs/common';
import { DisputeEngineService } from './dispute-engine.service';
import { DisputeEngineController } from './dispute-engine.controller';

@Module({
  controllers: [DisputeEngineController],
  providers: [DisputeEngineService],
  exports: [DisputeEngineService],
})
export class DisputeEngineModule {}
