import { Injectable, NotFoundException } from '@nestjs/common';
import { MarketConfig } from '../entities/market-config.entity';

const DEFAULT_MARKET_CONFIGS: Record<string, MarketConfig> = {
  NG: {
    id: 'mkt_ng_01',
    marketCode: 'NG',
    defaultCurrencies: ['XLM', 'NGN'],
    defaultRatePairs: ['XLM/NGN', 'XLM/USD'],
    onboardingSteps: ['verify_email', 'complete_kyc', 'link_bank_account', 'first_deposit', 'first_send'],
    kycTierRequired: 'TIER_2',
    fiatCurrency: 'NGN',
    isActive: true,
  },
  GB: {
    id: 'mkt_gb_01',
    marketCode: 'GB',
    defaultCurrencies: ['XLM', 'GBP'],
    defaultRatePairs: ['XLM/GBP', 'XLM/USD'],
    onboardingSteps: ['verify_email', 'complete_kyc', 'first_deposit', 'set_rate_alert'],
    kycTierRequired: 'TIER_1',
    fiatCurrency: 'GBP',
    isActive: true,
  },
  US: {
    id: 'mkt_us_01',
    marketCode: 'US',
    defaultCurrencies: ['XLM', 'USD'],
    defaultRatePairs: ['XLM/USD', 'XLM/EUR'],
    onboardingSteps: ['verify_email', 'complete_kyc', 'first_deposit', 'first_send'],
    kycTierRequired: 'TIER_1',
    fiatCurrency: 'USD',
    isActive: true,
  },
  GLOBAL: {
    id: 'mkt_global_01',
    marketCode: 'GLOBAL',
    defaultCurrencies: ['XLM'],
    defaultRatePairs: ['XLM/USD'],
    onboardingSteps: ['verify_email', 'complete_kyc', 'first_deposit'],
    kycTierRequired: 'TIER_1',
    fiatCurrency: 'USD',
    isActive: true,
  },
};

@Injectable()
export class MarketConfigService {
  private readonly configs = new Map<string, MarketConfig>(
    Object.entries(DEFAULT_MARKET_CONFIGS)
  );

  /**
   * Detects target market based on IP address geolocation.
   * Defaults to GLOBAL if IP cannot be resolved.
   */
  detectMarketFromIp(ip?: string): string {
    if (!ip) return 'GLOBAL';
    if (ip.startsWith('102.') || ip.startsWith('105.') || ip.includes('ng')) return 'NG';
    if (ip.startsWith('81.') || ip.includes('uk') || ip.includes('gb')) return 'GB';
    if (ip.startsWith('64.') || ip.startsWith('12.') || ip.includes('us')) return 'US';
    return 'GLOBAL';
  }

  getMarketConfig(marketCode: string): MarketConfig {
    const config = this.configs.get(marketCode.toUpperCase()) || this.configs.get('GLOBAL')!;
    return config;
  }

  getAllMarketConfigs(): MarketConfig[] {
    return Array.from(this.configs.values());
  }

  /**
   * Returns list of default currency wallets to create for user upon registration.
   */
  getWalletsForRegistration(marketCode: string): string[] {
    const config = this.getMarketConfig(marketCode);
    return config.defaultCurrencies;
  }

  /**
   * Returns ordered onboarding step keys customized for user's market.
   */
  getOnboardingSteps(marketCode: string): string[] {
    const config = this.getMarketConfig(marketCode);
    return config.onboardingSteps;
  }

  /**
   * Admin configuration update.
   */
  updateMarketConfig(marketCode: string, update: Partial<MarketConfig>): MarketConfig {
    const existing = this.getMarketConfig(marketCode);
    const updated: MarketConfig = {
      ...existing,
      ...update,
    };
    this.configs.set(marketCode.toUpperCase(), updated);
    return updated;
  }
}
