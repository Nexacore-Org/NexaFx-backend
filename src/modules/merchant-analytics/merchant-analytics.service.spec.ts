import { Test, TestingModule } from '@nestjs/testing';
import { MerchantAnalyticsService } from './merchant-analytics.service';

describe('MerchantAnalyticsService', () => {
  let service: MerchantAnalyticsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MerchantAnalyticsService],
    }).compile();

    service = module.get<MerchantAnalyticsService>(MerchantAnalyticsService);
  });

  it('should return aggregated dashboard metrics', () => {
    const metrics = service.getDashboardMetrics({
      merchantId: 'm-123',
      startDate: '2026-07-01',
      endDate: '2026-07-31'
    });
    
    expect(metrics.merchantId).toBe('m-123');
    expect(metrics.revenue.totalUsd).toBeGreaterThan(0);
    expect(metrics.funnel.conversionRate).toBe(18.0);
  });

  it('should generate CSV export correctly', () => {
    const csv = service.generateExport({
      merchantId: 'm-123',
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      format: 'csv'
    });
    
    expect(csv).toContain('date,revenue,conversion_rate');
  });
});
