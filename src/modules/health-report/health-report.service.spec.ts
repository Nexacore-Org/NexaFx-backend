import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { HealthReportService } from './health-report.service';
import { HealthReport } from './entities/health-report.entity';

describe('HealthReportService', () => {
  let service: HealthReportService;
  let repo: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    findAndCount: jest.Mock;
  };
  let dataSource: { query: jest.Mock };

  beforeEach(async () => {
    repo = {
      create: jest.fn().mockImplementation((dto) => ({ id: 'report-1', ...dto })),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      findOne: jest.fn(),
      findAndCount: jest.fn(),
    };

    dataSource = {
      query: jest.fn().mockResolvedValue([{}]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthReportService,
        { provide: getRepositoryToken(HealthReport), useValue: repo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(HealthReportService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('generateReport', () => {
    it('aggregates metrics from all signal sources and persists a report', async () => {
      // API metrics
      dataSource.query
        .mockResolvedValueOnce([
          {
            p50_latency: 12.5,
            p95_latency: 80,
            p99_latency: 150,
            error_rate: 0.01,
            total_requests: 10000,
          },
        ])
        // Queue metrics (placeholder query)
        .mockResolvedValueOnce([{ stats: {} }])
        // DB pool max
        .mockResolvedValueOnce([{ pool_max: 100 }])
        // Active connections
        .mockResolvedValueOnce([{ active: '10' }])
        // Slow queries
        .mockResolvedValueOnce([{ query: 'SELECT 1', avg_time: 5 }])
        // Table sizes
        .mockResolvedValueOnce([{ table: 'users', size: '10 MB' }])
        // Replication lag (not a replica)
        .mockRejectedValueOnce(new Error('not a replica'))
        // Security failed logins
        .mockResolvedValueOnce([{ failed_count: '5' }]);

      const report = await service.generateReport();

      expect(repo.create).toHaveBeenCalled();
      expect(repo.save).toHaveBeenCalled();
      expect(report.metrics.api.totalRequests).toBe(10000);
      expect(report.metrics.api.p99Latency).toBe(150);
      expect(report.metrics.security.failedLogins7d).toBe(5);
      expect(report.metrics.database.connectionPoolMax).toBe(100);
      expect(Array.isArray(report.anomalies)).toBe(true);
    });

    it('handles partial-data when one signal source fails without crashing', async () => {
      // API ok
      dataSource.query
        .mockResolvedValueOnce([
          {
            p50_latency: 10,
            p95_latency: 40,
            p99_latency: 90,
            error_rate: 0.5,
            total_requests: 500,
          },
        ])
        // Queue throws → collectQueueMetrics catches internally
        .mockRejectedValueOnce(new Error('redis down'))
        // DB queries succeed with empty-ish data
        .mockResolvedValueOnce([{ pool_max: 50 }])
        .mockResolvedValueOnce([{ active: '0' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ lag: null }])
        // Security
        .mockResolvedValueOnce([{ failed_count: '0' }]);

      // Queue path uses try/catch around its query; force the inner query to fail
      // by making the first queue query reject — service still returns a report.
      const report = await service.generateReport();

      expect(report).toBeDefined();
      expect(report.metrics).toBeDefined();
      expect(report.metrics.queues).toBeDefined();
      expect(repo.save).toHaveBeenCalled();
    });

    it('detects high error-rate anomaly', async () => {
      dataSource.query
        .mockResolvedValueOnce([
          {
            p50_latency: 5,
            p95_latency: 20,
            p99_latency: 50,
            error_rate: 12.5, // > 5
            total_requests: 1000,
          },
        ])
        .mockResolvedValueOnce([{}])
        .mockResolvedValueOnce([{ pool_max: 100 }])
        .mockResolvedValueOnce([{ active: '5' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockRejectedValueOnce(new Error('no replica'))
        .mockResolvedValueOnce([{ failed_count: '0' }]);

      const report = await service.generateReport();
      expect(report.anomalies.some((a) => a.includes('High API error rate'))).toBe(
        true,
      );
    });

    it('detects high p99 latency anomaly', async () => {
      dataSource.query
        .mockResolvedValueOnce([
          {
            p50_latency: 5,
            p95_latency: 20,
            p99_latency: 3500, // > 2000
            error_rate: 0.1,
            total_requests: 1000,
          },
        ])
        .mockResolvedValueOnce([{}])
        .mockResolvedValueOnce([{ pool_max: 100 }])
        .mockResolvedValueOnce([{ active: '5' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockRejectedValueOnce(new Error('no replica'))
        .mockResolvedValueOnce([{ failed_count: '0' }]);

      const report = await service.generateReport();
      expect(report.anomalies.some((a) => a.includes('High p99 latency'))).toBe(
        true,
      );
    });
  });

  describe('getLatestReport', () => {
    it('returns the most recent report ordered by createdAt DESC', async () => {
      const latest = { id: 'r1', reportDate: '2026-08-01' };
      repo.findOne.mockResolvedValue(latest);
      await expect(service.getLatestReport()).resolves.toEqual(latest);
      expect(repo.findOne).toHaveBeenCalledWith({
        order: { createdAt: 'DESC' },
      });
    });

    it('returns null when no reports exist', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.getLatestReport()).resolves.toBeNull();
    });
  });

  describe('getReports', () => {
    it('paginates with default page/limit', async () => {
      repo.findAndCount.mockResolvedValue([[{ id: 'r1' }], 1]);
      const result = await service.getReports();
      expect(result).toEqual({
        data: [{ id: 'r1' }],
        total: 1,
        page: 1,
        limit: 20,
      });
      expect(repo.findAndCount).toHaveBeenCalledWith({
        order: { createdAt: 'DESC' },
        skip: 0,
        take: 20,
      });
    });

    it('respects custom page and limit', async () => {
      repo.findAndCount.mockResolvedValue([[], 0]);
      await service.getReports(3, 5);
      expect(repo.findAndCount).toHaveBeenCalledWith({
        order: { createdAt: 'DESC' },
        skip: 10,
        take: 5,
      });
    });
  });
});
