export class BatchVerifyDto {
  hashes: string[];
}

export interface VerifiedOperationSummary {
  type: string;
  summary: string;
}

export interface StellarTxVerificationResult {
  hash: string;
  status: string;
  timestamp: string;
  fee: string;
  ledger: number;
  operations: VerifiedOperationSummary[];
  summary: string;
  nexafxLinked: boolean;
  nexafxReference: string | null;
  explorerUrl: string;
}
