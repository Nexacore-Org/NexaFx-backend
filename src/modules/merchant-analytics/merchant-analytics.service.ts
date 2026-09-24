import { Injectable } from '@nestjs/common';
import { AnalyticsQueryDto, ExportAnalyticsDto } from './dto/merchant-analytics.dto';

@Injectable()
export class MerchantAnalyticsService {
  /**
   * Retrieves aggregated analytics metrics for a merchant dashboard.
   */
  public getDashboardMetrics(query: AnalyticsQueryDto) {
    return {
      merchantId: query.merchantId,
      period: { start: query.startDate, end: query.endDate },
      revenue: {
        totalUsd: 15420.50,
        growthPercentage: 12.5,
      },
      funnel: {
        views: 10000,
        initiated: 2500,
        completed: 1800,
        conversionRate: 18.0,
      },
      geography: {
        'US': 45,
        'UK': 25,
        'EU': 20,
        'OTHER': 10,
      }
    };
  }

  /**
   * Generates a CSV or JSON export of the analytics data.
   */
  public generateExport(dto: ExportAnalyticsDto): string {
    if (dto.format === 'csv') {
      return `date,revenue,conversion_rate\n2026-07-01,500,18.0\n`;
    }
    return JSON.stringify(this.getDashboardMetrics(dto));
  }
}
