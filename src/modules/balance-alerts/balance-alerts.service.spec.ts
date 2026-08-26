import { Test, TestingModule } from '@nestjs/testing';
import { BalanceAlertsService } from './balance-alerts.service';

describe('BalanceAlertsService', () => {
  let service: BalanceAlertsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BalanceAlertsService],
    }).compile();

    service = module.get<BalanceAlertsService>(BalanceAlertsService);
  });

  it('should trigger BELOW alert when balance drops below threshold', () => {
    service.setupAlert({
      walletId: 'w-123',
      assetCode: 'USDC',
      thresholdAmount: 1000,
      triggerType: 'BELOW',
      notificationMethod: 'EMAIL'
    });

    const triggered = service.checkBalanceAndNotify({
      walletId: 'w-123',
      assetCode: 'USDC',
      currentBalance: 500
    });

    expect(triggered.length).toBe(1);
    expect(triggered[0].triggerType).toBe('BELOW');
  });

  it('should respect the cooldown period and not trigger repeatedly', () => {
    service.setupAlert({
      walletId: 'w-123',
      assetCode: 'USDC',
      thresholdAmount: 1000,
      triggerType: 'BELOW',
      notificationMethod: 'EMAIL'
    });

    const trigger1 = service.checkBalanceAndNotify({ walletId: 'w-123', assetCode: 'USDC', currentBalance: 500 });
    const trigger2 = service.checkBalanceAndNotify({ walletId: 'w-123', assetCode: 'USDC', currentBalance: 400 });

    expect(trigger1.length).toBe(1);
    expect(trigger2.length).toBe(0); // cooldown active
  });
});
