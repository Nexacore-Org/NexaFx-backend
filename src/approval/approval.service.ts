import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApprovalPolicy } from '../entities/approval-policy.entity';
import { PendingApproval, ApprovalStatus } from '../entities/pending-approval.entity';
import { EmailService } from '../../auth/email.service';
import { EventsService } from '../../realtime/events.service';

@Injectable()
export class ApprovalService {
  constructor(
    @InjectRepository(ApprovalPolicy)
    private readonly policyRepo: Repository<ApprovalPolicy>,
    @InjectRepository(PendingApproval)
    private readonly pendingRepo: Repository<PendingApproval>,
    private readonly emailService: EmailService,
    private readonly eventsService: EventsService,
    // Inject transactions or database manager to complete final balance execution updates
  ) {}

  /**
   * Evaluates active organization spending policies before funds are shifted.
   * Intercepted inside TransactionsService.create()
   */
  async evaluateTransactionApproval(txContext: {
    transactionId: string;
    organisationId?: string;
    amount: number;
    currency: string;
    initiatorId: string;
  }): Promise<{ isHeld: boolean; approvalId?: string }> {
    // Escape Fast: Workflow applies strictly to corporate organization wallets, not personal accounts
    if (!txContext.organisationId) {
      return { isHeld: false };
    }

    const activePolicies = await this.policyRepo.find({
      where: { organisationId: txContext.organisationId, isActive: true },
    });

    for (const policy of activePolicies) {
      if (
        txContext.currency === policy.conditions.currency &&
        txContext.amount >= policy.conditions.thresholdAmount
      ) {
        // Enforce Hold Sequence
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + policy.timeoutHours);

        const pendingApproval = this.pendingRepo.create({
          transactionId: txContext.transactionId,
          policyId: policy.id,
          initiatorId: txContext.initiatorId,
          organisationId: txContext.organisationId,
          status: ApprovalStatus.PENDING,
          expiresAt,
        });

        await this.pendingRepo.save(pendingApproval);

        // Notify all designated signing actors concurrently
        await this._notifyApprovers(policy.approvers, txContext.transactionId, txContext.amount, txContext.currency);

        return { isHeld: true, approvalId: pendingApproval.id };
      }
    }

    return { isHeld: false };
  }

  async processApproveAction(id: string, approverId: string, comment?: string): Promise<PendingApproval> {
    const pending = await this.pendingRepo.findOne({ where: { id } });
    if (!pending) throw new NotFoundException('Pending approval instance tracking marker missing.');
    if (pending.status !== ApprovalStatus.PENDING) throw new BadRequestException('Approval flow is no longer active.');

    const policy = await this.policyRepo.findOne({ where: { id: pending.policyId } });
    if (!policy) throw new NotFoundException('Associated structural approval policy is missing.');

    // Constraint: Validate that the signing actor belongs to the designated policy array list
    if (!policy.approvers.includes(approverId)) {
      throw new ForbiddenException('Actor identity is unauthorized to sign off against this spending policy.');
    }

    // Constraint: Prevent duplicate signature sign-offs by the same individual actor
    const alreadySigned = pending.approvals.some((sig) => sig.approverId === approverId);
    if (alreadySigned) throw new BadRequestException('Actor has already registered an active signature.');

    pending.approvals.push({ approverId, approvedAt: new Date(), comment });

    // Evaluate signature accumulation parameters
    if (pending.approvals.length >= policy.requiredApprovals) {
      pending.status = ApprovalStatus.APPROVED;
      // TODO: Call your payment module's core release function:
      // await this.transactionsService.executeHeldTransaction(pending.transactionId);
    }

    return await this.pendingRepo.save(pending);
  }

  async processRejectAction(id: string, approverId: string, reason: string): Promise<PendingApproval> {
    const pending = await this.pendingRepo.findOne({ where: { id } });
    if (!pending) throw new NotFoundException('Pending approval record missing.');
    if (pending.status !== ApprovalStatus.PENDING) throw new BadRequestException('Approval flow is no longer active.');

    const policy = await this.policyRepo.findOne({ where: { id: pending.policyId } });
    if (!policy || !policy.approvers.includes(approverId)) {
      throw new ForbiddenException('Actor identity unauthorized to log rejection states.');
    }

    pending.status = ApprovalStatus.REJECTED;
    await this.pendingRepo.save(pending);

    // TODO: Call your core transaction registry to drop the held row and log the rejection details:
    // await this.transactionsService.cancelHeldTransaction(pending.transactionId, `Rejected by approver: ${reason}`);

    return pending;
  }

  private async _notifyApprovers(approvers: string[], txId: string, amount: number, currency: string) {
    for (const approverUuid of approvers) {
      this.eventsService.sendNewNotification(approverUuid, {
        title: 'Action Required: Multi-Approver Sign-Off Pending',
        transactionId: txId,
        message: `Corporate transaction requires approval signature: ${amount} ${currency}.`,
      });
      // Optional: Await a background email notification dispatch loop here as needed
    }
  }
}