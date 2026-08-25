export class ProcessDisputeDto {
  disputeId: string;
  transactionId: string;
  amount: number;
  reasonCode: string;
  evidenceProvided: boolean;
}

export class OverrideDisputeDto {
  disputeId: string;
  adminId: string;
  newOutcome: 'MANUAL_REFUND' | 'MANUAL_REJECT';
  notes: string;
}
