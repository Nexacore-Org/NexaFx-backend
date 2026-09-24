import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { TAX_QUEUE } from '../modules/queues/queue.constants';
import { TaxService } from './tax.service';

@Processor(TAX_QUEUE)
export class TaxProcessor extends WorkerHost {
  private readonly logger = new Logger(TaxProcessor.name);

  constructor(private readonly taxService: TaxService) {
    super();
  }

  async process(job: Job<any>): Promise<void> {
    this.logger.debug(`Processing tax job ${job.id} with name ${job.name}`);
    switch (job.name) {
      case 'process-transaction':
        if (!job.data?.transactionId) {
          throw new Error('Missing transactionId in process-transaction job');
        }
        await this.taxService.processTransaction(job.data.transactionId);
        break;
      case 'export-tax-csv':
        if (!job.data?.jobId) {
          throw new Error('Missing jobId in export-tax-csv job');
        }
        await this.taxService.processExportJob(job.data.jobId);
        break;
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }
}
