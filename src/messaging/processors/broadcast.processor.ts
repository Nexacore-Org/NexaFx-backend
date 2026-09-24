import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { MessagingService } from '../messaging.service';

@Processor('broadcast')
export class BroadcastProcessor extends WorkerHost {
  private readonly logger = new Logger(BroadcastProcessor.name);

  constructor(private readonly messagingService: MessagingService) {
    super();
  }

  async process(job: Job<{ broadcastId: string }>): Promise<void> {
    this.logger.log(`Processing broadcast fan-out: ${job.data.broadcastId}`);
    await this.messagingService.processBroadcastFanOut(job.data.broadcastId);
  }
}
