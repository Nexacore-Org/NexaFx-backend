import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IndexAdvisorService } from './index-advisor.service';
import { IndexAdvisoryReport } from './entities/index-advisory-report.entity';
import { DataSource } from 'typeorm';
import { NotificationsService } from '../../notifications/notifications.service';
import { mock, DeepMockProxy } from 'jest-mock-extended';

describe('IndexAdvisorService', () => {
  let service: IndexAdvisorService;
  let reportRepository: DeepMockProxy<ReturnType<typeof mockReportRepository>>;
  let dataSource: DeepMockProxy<DataSource>;
  let notificationsService: DeepMockProxy<NotificationsService>;

  const mockReportRepository = () => ({
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    count: jest.fn(),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IndexAdvisorService,
        {
          provide: getRepositoryToken(IndexAdvisoryReport),
          useFactory: mockReportRepository,
        },
        {
          provide: DataSource,
          useValue: mock<DataSource>(),
        },
        {
          provide: NotificationsService,
          useValue: mock<NotificationsService>(),
        },
      ],
    }).compile();

    service = module.get<IndexAdvisorService>(IndexAdvisorService);
    reportRepository = module.get(getRepositoryToken(IndexAdvisoryReport));
    dataSource = module.get(DataSource);
    notificationsService = module.get(NotificationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('analyse', () => {
    it('should correctly identify a genuinely missing index', async () => {
      const mockMissingIndex = {
        schemaname: 'public',
        tablename: 'users',
        seq_scan: '2000',
        idx_scan: '50',
        table_size: '100 MB',
        n_live_tup: '20000',
      };

      dataSource.query.mockImplementation((query: string) => {
        if (query.includes('pg_stat_user_tables')) {
          return Promise.resolve([mockMissingIndex]);
        }
        if (query.includes('pg_stat_user_indexes')) {
          return Promise.resolve([]);
        }
        if (query.includes('pg_stat_statements')) {
          return Promise.resolve([]);
        }
        if (query.includes('pg_extension')) {
          return Promise.resolve([{ extname: 'pg_stat_statements' }]);
        }
        return Promise.resolve([]);
      });

      reportRepository.create.mockImplementation((report) => report as any);
      reportRepository.save.mockImplementation((report) =>
        Promise.resolve(report as any),
      );

      const report = await service.analyse();

      expect(report.missingIndexes).toHaveLength(1);
      expect(report.missingIndexes[0].tableName).toBe('public.users');
      expect(report.missingIndexes[0].seqScanCount).toBe(2000);
      expect(report.suggestedMigrations).toHaveLength(1);
      expect(report.suggestedMigrations[0]).toContain('CREATE INDEX CONCURRENTLY');
    });

    it('should not flag an already-indexed column', async () => {
      dataSource.query.mockImplementation((query: string) => {
        if (query.includes('pg_stat_user_tables')) {
          return Promise.resolve([]);
        }
        if (query.includes('pg_stat_user_indexes')) {
          return Promise.resolve([]);
        }
        if (query.includes('pg_stat_statements')) {
          return Promise.resolve([]);
        }
        if (query.includes('pg_extension')) {
          return Promise.resolve([{ extname: 'pg_stat_statements' }]);
        }
        return Promise.resolve([]);
      });

      reportRepository.create.mockImplementation((report) => report as any);
      reportRepository.save.mockImplementation((report) => Promise.resolve(report as any));

      const report = await service.analyse();

      expect(report.missingIndexes).toHaveLength(0);
    });

    it('should degrade gracefully if it cannot query for missing indexes', async () => {
      dataSource.query.mockImplementation((query: string) => {
        if (query.includes('pg_stat_user_tables')) {
          return Promise.reject(new Error('Permission denied'));
        }
        return Promise.resolve([]);
      });

      reportRepository.create.mockImplementation((report) => report as any);
      reportRepository.save.mockImplementation((report) => Promise.resolve(report as any));

      const report = await service.analyse();

      expect(report.missingIndexes).toHaveLength(0);
    });
  });

  describe('getLatestReport', () => {
    it('should return the latest report', async () => {
      const mockReport = { id: '1', runAt: new Date() } as IndexAdvisoryReport;
      reportRepository.findOne.mockResolvedValue(mockReport);

      const report = await service.getLatestReport();

      expect(report).toEqual(mockReport);
      expect(reportRepository.findOne).toHaveBeenCalledWith({
        order: { runAt: 'DESC' },
      });
    });
  });

  describe('getReportHistory', () => {
    it('should return paginated report history', async () => {
      const mockReports = [{ id: '1' }, { id: '2' }] as IndexAdvisoryReport[];
      reportRepository.count.mockResolvedValue(2);
      reportRepository.find.mockResolvedValue(mockReports);

      const result = await service.getReportHistory(1, 10);

      expect(result.total).toBe(2);
      expect(result.reports).toEqual(mockReports);
    });
  });

  describe('getLatestMigrationSQL', () => {
    it('should return SQL for the latest report', async () => {
      const mockReport = {
        suggestedMigrations: ['CREATE INDEX foo;'],
        runAt: new Date(),
      } as IndexAdvisoryReport;
      jest.spyOn(service, 'getLatestReport').mockResolvedValue(mockReport);

      const sql = await service.getLatestMigrationSQL();

      expect(sql).toContain('CREATE INDEX foo;');
    });

    it('should return a message if no report is available', async () => {
      jest.spyOn(service, 'getLatestReport').mockResolvedValue(null);

      const sql = await service.getLatestMigrationSQL();

      expect(sql).toContain('No advisory report available');
    });
  });
});
  });
});