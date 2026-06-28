import { Module } from '@nestjs/common';
import { PlatformHealthRunbookController } from './platform-health-runbook.controller';
import { PlatformHealthRunbookService } from './platform-health-runbook.service';

@Module({
  controllers: [PlatformHealthRunbookController],
  providers: [PlatformHealthRunbookService],
  exports: [PlatformHealthRunbookService],
})
export class PlatformHealthRunbookModule {}
