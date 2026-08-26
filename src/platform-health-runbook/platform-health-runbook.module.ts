import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullMQModule } from '@nestjs/bullmq';
import { PlatformHealthRunbookController } from './platform-health-runbook.controller';
import { PlatformHealthRunbookService } from './platform-health-runbook.service';
import {
  Transaction,
} from '../transactions/entities/transaction.entity';
import {
  EMAIL_QUEUE,
  WEBHOOK_QUEUE,
  TAX_QUEUE,
} from '../modules/queues/queue.constants';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction]),
    BullMQModule.registerQueue(
      { name: EMAIL_QUEUE },
      { name: WEBHOOK_QUEUE },
      { name: TAX_QUEUE },
    ),
  ],
  controllers: [PlatformHealthRunbookController],
  providers: [PlatformHealthRunbookService],
  exports: [PlatformHealthRunbookService],
})
export class PlatformHealthRunbookModule {}
