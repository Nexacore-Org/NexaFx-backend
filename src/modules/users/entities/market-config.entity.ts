export interface MarketConfig {
  id: string;
  marketCode: string; // e.g. NG, GB, US, GH, GLOBAL
  defaultCurrencies: string[];
  defaultRatePairs: string[];
  onboardingSteps: string[];
  kycTierRequired: string;
  fiatCurrency: string;
  isActive: boolean;
}
