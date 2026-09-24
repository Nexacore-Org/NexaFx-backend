export enum FraudRingStatus {
  OPEN = 'OPEN',
  REVIEWED = 'REVIEWED',
  FALSE_POSITIVE = 'FALSE_POSITIVE',
  CONFIRMED = 'CONFIRMED',
}

export interface FraudRing {
  id: string;
  detectedAt: Date;
  participants: string[];
  transactionIds: string[];
  cyclePattern: string;
  totalCycledAmountUsd: number;
  status: FraudRingStatus;
  reviewedBy?: string;
  reviewedAt?: Date;
}
