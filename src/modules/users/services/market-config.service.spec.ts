import { Test, TestingModule } from '@nestjs/testing';
import { MarketConfigService } from './market-config.service';

describe('MarketConfigService (Issue #772)', () => {
  let service: MarketConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MarketConfigService],
    }).compile();

    service = module.get<MarketConfigService>(MarketConfigService);
  });

  it('should detect Nigerian market and return XLM + NGN default wallets', () => {
    const market = service.detectMarketFromIp('102.89.23.4');
    expect(market).toBe('NG');

    const wallets = service.getWalletsForRegistration(market);
    expect(wallets).toEqual(['XLM', 'NGN']);
  });

  it('should detect UK market and return XLM + GBP default wallets', () => {
    const market = service.detectMarketFromIp('81.2.69.142');
    expect(market).toBe('GB');

    const wallets = service.getWalletsForRegistration(market);
    expect(wallets).toEqual(['XLM', 'GBP']);
  });

  it('should default unknown IP to GLOBAL market with XLM wallet only', () => {
    const market = service.detectMarketFromIp('192.168.1.1');
    expect(market).toBe('GLOBAL');

    const wallets = service.getWalletsForRegistration(market);
    expect(wallets).toEqual(['XLM']);
  });

  it('should filter onboarding steps per market', () => {
    const ngSteps = service.getOnboardingSteps('NG');
    expect(ngSteps).toContain('link_bank_account');

    const gbSteps = service.getOnboardingSteps('GB');
    expect(gbSteps).toContain('set_rate_alert');
    expect(gbSteps).not.toContain('link_bank_account');
  });

  it('should allow admin to update market config without restarting', () => {
    const updated = service.updateMarketConfig('NG', { kycTierRequired: 'TIER_3' });
    expect(updated.kycTierRequired).toBe('TIER_3');
  });
});
