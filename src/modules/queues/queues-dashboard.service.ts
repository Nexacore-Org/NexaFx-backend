import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { EMAIL_QUEUE, WEBHOOK_QUEUE } from './queue.constants';

@Injectable()
export class QueuesDashboardService {
  private readonly serverAdapter = new ExpressAdapter();

  constructor(
    @InjectQueue(EMAIL_QUEUE) emailQueue: Queue,
    @InjectQueue(WEBHOOK_QUEUE) webhookQueue: Queue,
  ) {
    this.serverAdapter.setBasePath('/admin/queues');
    createBullBoard({
      queues: [new BullMQAdapter(emailQueue), new BullMQAdapter(webhookQueue)],
      serverAdapter: this.serverAdapter,
    });
  }

  getRouter() {
    return this.serverAdapter.getRouter();
  }
}
