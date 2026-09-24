import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import { InjectRedis } from '@nestjs-modules/ioredis'; // Adjust based on your Redis module setup
import { ComplianceMetricsSnapshot } from './entities/compliance-snapshot.entity';

@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name);
  private readonly DASHBOARD_CACHE_KEY = 'nexafx:compliance:dashboard-cache';
  private readonly ALERT_QUEUE_KEY = 'nexafx:compliance-alerts';

  constructor(
    @InjectRepository(ComplianceMetricsSnapshot)
    private readonly snapshotRepo: Repository<ComplianceMetricsSnapshot>,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  public async getDashboardData(): Promise<any> {
    const cachedData = await this.redis.get(this.DASHBOARD_CACHE_KEY);
    if (cachedData) return JSON.parse(cachedData);

    // Concurrent execution pipeline assembly using Promise.all
    const [aml, kyc, fraud, sanctions, transactions, system] = await Promise.all([
      this.fetchAmlMetrics(),
      this.fetchKycMetrics(),
      this.fetchFraudMetrics(),
      this.fetchSanctionsMetrics(),
      this.fetchTransactionMetrics(),
      this.fetchSystemMetrics(),
    ]);

    const dashboardPayload = { aml, kyc, fraud, sanctions, transactions, system };

    // Cache metrics for exactly 30 seconds
    await this.redis.setex(this.DASHBOARD_CACHE_KEY, 30, JSON.stringify(dashboardPayload));
    return dashboardPayload;
  }

  public async getPriorityAlerts(): Promise<any[]> {
    const rawAlerts = await this.redis.lrange(this.ALERT_QUEUE_KEY, 0, 49);
    return rawAlerts.map(raw => JSON.parse(raw));
  }

  public async acknowledgeAlert(alertId: string): Promise<void> {
    const alerts = await this.redis.lrange(this.ALERT_QUEUE_KEY, 0, -1);
    for (const rawAlert of alerts) {
      const alert = JSON.parse(rawAlert);
      if (alert.id === alertId) {
        await this.redis.lrem(this.ALERT_QUEUE_KEY, 1, rawAlert);
        break;
      }
    }
  }

  public async getHistoricalTrends(days: number): Promise<ComplianceMetricsSnapshot[]> {
    return this.snapshotRepo.createQueryBuilder('snapshot')
      .where('snapshot.snapshotDate >= NOW() - INTERVAL :days DAY', { days })
      .orderBy('snapshot.snapshotDate', 'ASC')
      .getMany();
  }

  // Mocked Internal Read-only aggregators to remain safe from mutations
  private async fetchAmlMetrics() { return { openFlags: 14, flagsLast24h: 4, sarsFiled: 2 }; }
  private async fetchKycMetrics() { return { pendingReview: 42, approvedToday: 118, expiringSoon: 5 }; }
  private async fetchFraudMetrics() { return { riskAlertsOpen: 8, blockedIps: 124 }; }
  private async fetchSanctionsMetrics() { return { pendingScreenings: 3, matches: 0 }; }
  private async fetchTransactionMetrics() { return { volumeUsd24h: 1425000, count24h: 8420, largeCount: 31 }; }
  private async fetchSystemMetrics() { return { activeUsers: 1420, queueBacklog: 0 }; }
}