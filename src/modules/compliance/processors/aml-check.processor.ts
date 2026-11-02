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
    const tx = await this.transactionRepo.findOne({
      where: { id: transactionId },
    });
    if (!tx) {
      this.logger.warn(`Transaction ${transactionId} not found`);
      return;
    }
    const evaluated = await this.amlService.evaluate(tx);
    const violatedRules = Array.isArray(evaluated)
      ? evaluated
      : evaluated
        ? [evaluated]
        : [];

    if (violatedRules.length > 0) {
      for (const rule of violatedRules) {
        await this.flagService.createFlag(tx, rule);
        this.logger.log(
          `Created flag for transaction ${transactionId} (rule: ${rule})`,
        );
      }
    } else {
      this.logger.log(`Transaction ${transactionId} passed AML checks`);
    }
  }
}
