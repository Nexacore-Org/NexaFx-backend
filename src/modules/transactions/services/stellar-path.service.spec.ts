import { Test, TestingModule } from '@nestjs/testing';
import { StellarPathService } from './stellar-path.service';
import { BadRequestException } from '@nestjs/common';

describe('StellarPathService (Issue #769)', () => {
  let service: StellarPathService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StellarPathService],
    }).compile();

    service = module.get<StellarPathService>(StellarPathService);
  });

  it('should generate a path quote for cross-currency payment', async () => {
    const quote = await service.quotePathPayment({
      sendCurrency: 'XLM',
      sendAmount: '100',
      receiveCurrency: 'NGN',
    });

    expect(quote.sourceAsset).toBe('XLM');
    expect(quote.destinationAsset).toBe('NGN');
    expect(parseFloat(quote.destinationAmount)).toBeGreaterThan(0);
    expect(quote.path.length).toBeGreaterThan(0);
  });

  it('should execute path payment successfully and auto-create recipient wallet', async () => {
    const result = await service.executePathPayment({
      sendCurrency: 'XLM',
      sendAmount: '50',
      receiveCurrency: 'NGN',
      recipientUserId: 'usr_recip_999',
      maxSlippagePercent: 2.0,
    });

    expect(result.status).toBe('SUCCESS');
    expect(result.recipientWalletCreated).toBe(true);
    expect(result.transactionId).toContain('tx_path_');
  });

  it('should throw BadRequestException when send amount is invalid', async () => {
    await expect(
      service.quotePathPayment({
        sendCurrency: 'XLM',
        sendAmount: '-10',
        receiveCurrency: 'NGN',
      })
    ).rejects.toThrow(BadRequestException);
  });
});
