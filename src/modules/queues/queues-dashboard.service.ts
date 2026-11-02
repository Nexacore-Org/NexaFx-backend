import { Injectable, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { EMAIL_QUEUE, WEBHOOK_QUEUE, TAX_QUEUE } from './queue.constants';

@Injectable()
export class QueuesDashboardService {
  private readonly serverAdapter = new ExpressAdapter();

  constructor(
    @InjectQueue(EMAIL_QUEUE) emailQueue: Queue,
    @InjectQueue(WEBHOOK_QUEUE) webhookQueue: Queue,
    @Optional() @InjectQueue(TAX_QUEUE) taxQueue?: Queue,
  ) {
    this.serverAdapter.setBasePath('/admin/queues');
    const queues = [
      new BullMQAdapter(emailQueue),
      new BullMQAdapter(webhookQueue),
      ...(taxQueue ? [new BullMQAdapter(taxQueue)] : []),
    ];
    createBullBoard({
      queues,
      serverAdapter: this.serverAdapter as unknown as Parameters<
        typeof createBullBoard
      >[0]['serverAdapter'],
    });
  }

  getRouter() {
    return this.serverAdapter.getRouter();
  }
}
