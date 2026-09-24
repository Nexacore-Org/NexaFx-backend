import { Injectable, NotFoundException } from '@nestjs/common';
import { ProcessDisputeDto, OverrideDisputeDto } from './dto/dispute-engine.dto';

@Injectable()
export class DisputeEngineService {
  private disputes = new Map<string, any>();

  /**
   * Processes a dispute through the auto-resolution engine.
   * Applies rule-based screening to determine outcome.
   */
  public async processDispute(dto: ProcessDisputeDto) {
    let outcome = 'PENDING_MANUAL_REVIEW';

    // Rule 1: Small amounts without evidence are auto-rejected
    if (dto.amount < 10 && !dto.evidenceProvided) {
      outcome = 'AUTO_REJECT';
    } 
    // Rule 2: Fraud reason codes with evidence are auto-chargebacked
    else if (dto.reasonCode === 'FRAUD' && dto.evidenceProvided) {
      outcome = 'AUTO_CHARGEBACK';
    }

    const disputeRecord = {
      ...dto,
      status: outcome,
      processedAt: new Date().toISOString(),
    };

    this.disputes.set(dto.disputeId, disputeRecord);

    return disputeRecord;
  }

  /**
   * Allows an admin to override an automated or pending decision.
   */
  public overrideDecision(dto: OverrideDisputeDto) {
    const dispute = this.disputes.get(dto.disputeId);
    if (!dispute) {
      throw new NotFoundException(`Dispute ${dto.disputeId} not found`);
    }

    dispute.status = dto.newOutcome;
    dispute.adminId = dto.adminId;
    dispute.overrideNotes = dto.notes;
    dispute.updatedAt = new Date().toISOString();

    return dispute;
  }
}
