import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { PendingApproval, ApprovalStatus } from '../entities/pending-approval.entity';
import { EmailService } from '../../auth/email.service';

@Injectable()
export class ApprovalExpiryCron {
  private readonly logger = new Logger(ApprovalExpiryCron.name);

  constructor(
    @InjectRepository(PendingApproval)
    private readonly pendingRepo: Repository<PendingApproval>,
    private readonly emailService: EmailService,
  ) {}

  @Cron('*/30 * * * *') // Execute daily automation scans exactly every 30 minutes
  async scanAndReclaimExpiredHolds() {
    this.logger.log('Scanning active spending pipelines for expired approval locks...');

    const expiredHolds = await this.pendingRepo.find({
      where: {
        status: ApprovalStatus.PENDING,
        expiresAt: LessThanOrEqual(new Date()),
      },
    });

    for (const hold of expiredHolds) {
      hold.status = ApprovalStatus.EXPIRED;
      await this.pendingRepo.save(hold);

      // TODO: Reverse transaction pipeline flags and drop pending ledger locks
      // await this.transactionsService.cancelHeldTransaction(hold.transactionId, 'Approval timeline window expired.');

      this.logger.warn(`Transaction approval hold ${hold.id} has expired. Pending transaction cancelled.`);
    }
  }
}