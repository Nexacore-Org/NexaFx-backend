import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataSource } from 'typeorm';
import {
  IndexAdvisoryReport,
  MissingIndex,
  UnusedIndex,
  SlowQuery,
} from './entities/index-advisory-report.entity';
import { NotificationsService } from '../../notifications/notifications.service';
import { NotificationType } from '../../notifications/entities/notification.entity';

@Injectable()
export class IndexAdvisorService {
  private readonly logger = new Logger(IndexAdvisorService.name);

  constructor(
    @InjectRepository(IndexAdvisoryReport)
    private readonly reportRepository: Repository<IndexAdvisoryReport>,
    private readonly dataSource: DataSource,
    private readonly notificationsService: NotificationsService,
  ) {}

  async analyse(): Promise<IndexAdvisoryReport> {
    this.logger.log('Starting database index advisory analysis');

    const [missingIndexes, unusedIndexes, slowQueries] = await Promise.all([
      this.findMissingIndexes(),
      this.findUnusedIndexes(),
      this.findSlowQueries(),
    ]);

    const suggestedMigrations = this.generateMigrationSuggestions(
      missingIndexes,
      unusedIndexes,
    );

    const hasCriticalFindings = slowQueries.some(
      (q) => q.meanExecTimeMs > 500,
    );

    const report = this.reportRepository.create({
      runAt: new Date(),
      missingIndexes,
      unusedIndexes,
      slowQueries,
      suggestedMigrations,
      hasCriticalFindings,
    });

    const saved = await this.reportRepository.save(report);

    this.logger.log(
      `Index advisory analysis complete: ${missingIndexes.length} missing, ` +
        `${unusedIndexes.length} unused, ${slowQueries.length} slow queries`,
    );

    try {
      await this.sendReportEmail(saved);
    } catch (error: unknown) {
      this.logger.error(
        `Failed to send advisory report email: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return saved;
  }

  async getLatestReport(): Promise<IndexAdvisoryReport | null> {
    return this.reportRepository.findOne({
      order: { runAt: 'DESC' },
    });
  }

  async getReportHistory(
    page: number = 1,
    limit: number = 20,
  ): Promise<{ reports: IndexAdvisoryReport[]; total: number }> {
    const total = await this.reportRepository.count();
    const reports = await this.reportRepository.find({
      order: { runAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { reports, total };
  }

  async getLatestMigrationSQL(): Promise<string> {
    const report = await this.getLatestReport();
    if (!report) {
      return '-- No advisory report available yet. Run analysis first.';
    }

    const header = [
      '-- ============================================================',
      '-- DB Index Advisory — Suggested Migrations',
      `-- Generated: ${report.runAt.toISOString()}`,
      '-- WARNING: Review carefully before applying — indexes affect write performance.',
      '-- ============================================================',
      '',
    ].join('\n');

    return header + report.suggestedMigrations.join('\n\n');
  }

  private async findMissingIndexes(): Promise<MissingIndex[]> {
    try {
      const results = await this.dataSource.query(`
        SELECT
          schemaname,
          relname AS tablename,
          seq_scan,
          idx_scan,
          pg_size_pretty(pg_relation_size(relid)) AS table_size,
          n_live_tup AS row_count
        FROM pg_stat_user_tables
        WHERE seq_scan > 1000
          AND (idx_scan IS NULL OR idx_scan < 100)
          AND n_live_tup > 10000
        ORDER BY seq_scan DESC
        LIMIT 50
      `);

      return results.map((row: any) => ({
        tableName: `${row.schemaname}.${row.tablename}`,
        seqScanCount: parseInt(row.seq_scan, 10),
        idxScanCount: parseInt(row.idx_scan ?? '0', 10),
        tableSize: row.table_size,
        suggestedIndex: this.generateMissingIndexSQL(
          row.schemaname,
          row.tablename,
          row.seq_scan,
        ),
      }));
    } catch (error: unknown) {
      this.logger.warn(
        `Could not query missing indexes (pg_stat may not be available): ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  private async findUnusedIndexes(): Promise<UnusedIndex[]> {
    try {
      const results = await this.dataSource.query(`
        SELECT
          schemaname,
          relname AS tablename,
          indexrelname AS indexname,
          idx_scan,
          pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
        FROM pg_stat_user_indexes
        WHERE idx_scan = 0
          AND pg_relation_size(indexrelid) > 1048576
          AND indexrelname NOT LIKE '%_pkey'
        ORDER BY pg_relation_size(indexrelid) DESC
        LIMIT 50
      `);

      return results.map((row: any) => ({
        tableName: `${row.schemaname}.${row.tablename}`,
        indexName: row.indexname,
        indexSize: row.index_size,
        scanCount: parseInt(row.idx_scan, 10),
        suggestedDrop: `DROP INDEX IF EXISTS "${row.schemaname}"."${row.indexname}";`,
      }));
    } catch (error: unknown) {
      this.logger.warn(
        `Could not query unused indexes: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  private async findSlowQueries(): Promise<SlowQuery[]> {
    try {
      const hasPgStatStatements = await this.dataSource.query(`
        SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements'
      `);

      if (!hasPgStatStatements.length) {
        this.logger.warn(
          'pg_stat_statements extension not available — skipping slow query analysis',
        );
        return [];
      }

      const results = await this.dataSource.query(`
        SELECT
          query,
          mean_exec_time,
          calls,
          total_exec_time
        FROM pg_stat_statements
        WHERE mean_exec_time > 100
          AND calls > 100
          AND dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
        ORDER BY mean_exec_time DESC
        LIMIT 50
      `);

      return results.map((row: any) => ({
        query: row.query.substring(0, 500),
        meanExecTimeMs: parseFloat(row.mean_exec_time),
        calls: parseInt(row.calls, 10),
        totalExecTimeMs: parseFloat(row.total_exec_time),
      }));
    } catch (error: unknown) {
      this.logger.warn(
        `Could not query slow queries: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  private generateMigrationSuggestions(
    missingIndexes: MissingIndex[],
    unusedIndexes: UnusedIndex[],
  ): string[] {
    const migrations: string[] = [];

    for (const missing of missingIndexes) {
      migrations.push(missing.suggestedIndex);
    }

    for (const unused of unusedIndexes) {
      migrations.push(unused.suggestedDrop);
    }

    return migrations;
  }

  private generateMissingIndexSQL(
    schema: string,
    tableName: string,
    seqScanCount: number,
  ): string {
    const indexName = `idx_${tableName}_auto_advisory`;
    const condition =
      seqScanCount > 5000 ? 'WHERE created_at > NOW() - INTERVAL \'90 days\'' : '';

    return `CREATE INDEX CONCURRENTLY IF NOT EXISTS "${schema}"."${indexName}" ON "${schema}"."${tableName}" (created_at DESC) ${condition};`;
  }

  private async sendReportEmail(report: IndexAdvisoryReport): Promise<void> {
    const dbAdminEmails = process.env.DB_ADMIN_EMAILS;
    if (!dbAdminEmails) {
      this.logger.debug('DB_ADMIN_EMAILS not configured — skipping email');
      return;
    }

    const severity = report.hasCriticalFindings ? 'CRITICAL' : 'INFO';
    const summary = [
      `${severity}: Database Index Advisory Report`,
      `Run at: ${report.runAt.toISOString()}`,
      '',
      `Missing indexes: ${report.missingIndexes.length}`,
      `Unused indexes: ${report.unusedIndexes.length}`,
      `Slow queries: ${report.slowQueries.length}`,
    ];

    if (report.hasCriticalFindings) {
      const criticalQueries = report.slowQueries.filter(
        (q) => q.meanExecTimeMs > 500,
      );
      summary.push('');
      summary.push('CRITICAL slow queries (>500ms mean):');
      for (const q of criticalQueries) {
        summary.push(`  - ${q.meanExecTimeMs.toFixed(1)}ms avg (${q.calls} calls): ${q.query.substring(0, 100)}...`);
      }
    }

    this.logger.log(
      `Advisory report email would be sent to: ${dbAdminEmails}\n${summary.join('\n')}`,
    );
  }
}
