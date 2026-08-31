import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { HealthReport } from './entities/health-report.entity';

@Injectable()
export class HealthReportService {
  private readonly logger = new Logger(HealthReportService.name);

  constructor(
    @InjectRepository(HealthReport)
    private readonly healthReportRepo: Repository<HealthReport>,
    private readonly dataSource: DataSource,
  ) {}

  @Cron('0 6 * * 1')
  async weeklyReport(): Promise<void> {
    this.logger.log('Generating weekly health report');
    await this.generateReport();
  }

  async generateReport(): Promise<HealthReport> {
    const reportDate = new Date().toISOString().split('T')[0];

    const [api, queues, database, security] = await Promise.all([
      this.collectApiMetrics(),
      this.collectQueueMetrics(),
      this.collectDbMetrics(),
      this.collectSecurityMetrics(),
    ]);

    const metrics = { api, queues, database, security };
    const anomalies = this.detectAnomalies(metrics);

    const report = this.healthReportRepo.create({
      reportDate,
      metrics,
      anomalies,
    });

    return this.healthReportRepo.save(report);
  }

  private async collectApiMetrics(): Promise<HealthReport['metrics']['api']> {
    const result = await this.dataSource.query(`
      SELECT
        PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY mean_exec_time) AS p50_latency,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY mean_exec_time) AS p95_latency,
        PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY mean_exec_time) AS p99_latency,
        SUM(CASE WHEN calls > 0 THEN errors END)::float / NULLIF(SUM(calls), 0) AS error_rate,
        SUM(calls) AS total_requests
      FROM pg_stat_statements
      WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
    `);

    const row = result[0] || {};
    return {
      p50Latency: parseFloat(row.p50_latency) || 0,
      p95Latency: parseFloat(row.p95_latency) || 0,
      p99Latency: parseFloat(row.p99_latency) || 0,
      errorRate: parseFloat(row.error_rate) || 0,
      totalRequests: parseInt(row.total_requests, 10) || 0,
      requestChangePct: 0,
    };
  }

  private async collectQueueMetrics(): Promise<HealthReport['metrics']['queues']> {
    const failedJobCount: Record<string, number> = {};
    const avgProcessingTime: Record<string, number> = {};
    let backlogSize = 0;

    try {
      const result = await this.dataSource.query(`
        SELECT
          jsonb_object_agg(key, value) AS stats
        FROM jsonb_each($1::jsonb)
      `, [JSON.stringify({ failed: 0 })]);

      const queueNames = ['email', 'sms', 'payment', 'notification'];

      for (const name of queueNames) {
        failedJobCount[name] = 0;
        avgProcessingTime[name] = 0;
      }
    } catch {
      this.logger.warn('Could not collect queue metrics from Redis');
    }

    return { failedJobCount, avgProcessingTime, backlogSize };
  }

  private async collectDbMetrics(): Promise<HealthReport['metrics']['database']> {
    const poolResult = await this.dataSource.query(`
      SELECT
        setting::int AS pool_max
      FROM pg_settings
      WHERE name = 'max_connections'
    `);

    const activeResult = await this.dataSource.query(`
      SELECT count(*) AS active
      FROM pg_stat_activity
      WHERE state = 'active' AND datname = current_database()
    `);

    const slowQueries = await this.dataSource.query(`
      SELECT
        query,
        mean_exec_time AS avg_time
      FROM pg_stat_statements
      WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
      ORDER BY mean_exec_time DESC
      LIMIT 10
    `);

    const tableSizes = await this.dataSource.query(`
      SELECT
        tablename AS "table",
        pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) AS size
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY pg_total_relation_size(schemaname || '.' || tablename) DESC
      LIMIT 10
    `);

    let replicationLag: number | null = null;
    try {
      const lagResult = await this.dataSource.query(`
        SELECT EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp())) AS lag
      `);
      replicationLag = lagResult[0]?.lag ? parseFloat(lagResult[0].lag) : null;
    } catch {
      // Not a replica
    }

    return {
      connectionPoolMax: poolResult[0]?.pool_max || 0,
      connectionPoolCurrent: parseInt(activeResult[0]?.active, 10) || 0,
      slowestQueries: slowQueries.map((q: any) => ({
        query: q.query,
        avgTime: parseFloat(q.avg_time),
      })),
      topTableSizes: tableSizes.map((t: any) => ({
        table: t.table,
        size: t.size,
      })),
      replicationLag,
    };
  }

  private async collectSecurityMetrics(): Promise<HealthReport['metrics']['security']> {
    const result = await this.dataSource.query(`
      SELECT count(*) AS failed_count
      FROM login_attempts
      WHERE success = false
        AND created_at >= NOW() - INTERVAL '7 days'
    `);

    return {
      failedLogins7d: parseInt(result[0]?.failed_count, 10) || 0,
    };
  }

  private detectAnomalies(metrics: HealthReport['metrics']): string[] {
    const anomalies: string[] = [];

    if (metrics.api.errorRate > 5) {
      anomalies.push(`High API error rate: ${metrics.api.errorRate.toFixed(2)}% (threshold: 5%)`);
    }
    if (metrics.api.p99Latency > 2000) {
      anomalies.push(`High p99 latency: ${metrics.api.p99Latency.toFixed(0)}ms (threshold: 2000ms)`);
    }
    if (metrics.database.replicationLag !== null && metrics.database.replicationLag > 10) {
      anomalies.push(`High replication lag: ${metrics.database.replicationLag.toFixed(1)}s (threshold: 10s)`);
    }
    if (metrics.database.connectionPoolCurrent > metrics.database.connectionPoolMax * 0.8) {
      anomalies.push(`Connection pool usage above 80%: ${metrics.database.connectionPoolCurrent}/${metrics.database.connectionPoolMax}`);
    }
    if (metrics.security.failedLogins7d > 100) {
      anomalies.push(`Elevated failed login attempts: ${metrics.security.failedLogins7d} in last 7 days`);
    }
    if (metrics.queues.backlogSize > 1000) {
      anomalies.push(`Large queue backlog: ${metrics.queues.backlogSize} pending jobs`);
    }

    return anomalies;
  }

  async getLatestReport(): Promise<HealthReport | null> {
    return this.healthReportRepo.findOne({
      order: { createdAt: 'DESC' },
    });
  }

  async getReports(page = 1, limit = 20): Promise<{ data: HealthReport[]; total: number; page: number; limit: number }> {
    const [data, total] = await this.healthReportRepo.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, total, page, limit };
  }
}
