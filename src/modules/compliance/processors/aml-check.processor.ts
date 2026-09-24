import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { AmlService } from '../aml.service';
import { ComplianceFlagService } from '../compliance-flag.service';
import { Transaction } from '../../../transactions/entities/transaction.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Processor('aml-check')
@Injectable()
export class AmlCheckProcessor extends WorkerHost {
  private readonly logger = new Logger(AmlCheckProcessor.name);

  constructor(
    private readonly amlService: AmlService,
    private readonly flagService: ComplianceFlagService,
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
  ) {
    super();
  }

  async process(job: Job<{ transactionId: string }>): Promise<void> {
    const { transactionId } = job.data;
    const tx = await this.transactionRepo.findOne({ where: { id: transactionId } });
    if (!tx) {
      this.logger.warn(`Transaction ${transactionId} not found`);
      return;
    }
    const violatedRule = await this.amlService.evaluate(tx);
    if (violatedRule) {
      await this.flagService.createFlag(tx, violatedRule);
      this.logger.log(`Created flag for transaction ${transactionId} (rule: ${violatedRule})`);
    } else {
      this.logger.log(`Transaction ${transactionId} passed AML checks`);
    }
  }
}
