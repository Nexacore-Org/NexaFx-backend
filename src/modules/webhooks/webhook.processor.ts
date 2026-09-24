import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { WEBHOOK_QUEUE } from '../queues/queue.constants';
import { WebhookService } from '../../webhooks/services/webhook.service';

export interface WebhookDeliveryJob {
  deliveryId: string;
}

@Processor(WEBHOOK_QUEUE)
export class WebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(private readonly webhookService: WebhookService) {
    super();
  }

  async process(job: Job<WebhookDeliveryJob>): Promise<void> {
    await this.webhookService.processDeliveryJob(job.data.deliveryId);
    this.logger.debug(`Processed webhook job ${job.id}`);
  }
}
