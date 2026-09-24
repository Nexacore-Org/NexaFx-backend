export interface KycStep {
  step: number;
  title: string;
  durationMinutes: number;
}

export class KycUpgradeRequiredExceptionResponse {
  statusCode: number = 402;
  code: string = 'KYC_UPGRADE_REQUIRED';
  currentTier: string;
  requiredTier: string;
  blockedAmount: string;
  tierLimit: string;
  upgradeUrl: string;
  upgradeSteps: KycStep[];
  message: string;
}