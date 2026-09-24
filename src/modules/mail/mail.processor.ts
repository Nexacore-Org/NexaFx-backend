import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EMAIL_QUEUE } from '../queues/queue.constants';
import { MailService, SendEmailJob } from './mail.service';

@Processor(EMAIL_QUEUE)
export class MailProcessor extends WorkerHost {
  private readonly logger = new Logger(MailProcessor.name);

  constructor(private readonly mailService: MailService) {
    super();
  }

  async process(job: Job<SendEmailJob>): Promise<void> {
    await this.mailService.sendNow(job.data);
    this.logger.debug(`Processed email job ${job.id}`);
  }
}
