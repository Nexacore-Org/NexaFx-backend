import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import {
  FINCRIME_REPORT_GENERATED,
  FINCRIME_REPORT_SUBMITTED,
  FinancialCrimeReportService,
} from './financial-crime-report.service';
import { GoAmlReportService } from './goaml-report.service';
import {
  FinancialCrimeReport,
  FinancialCrimeReportFormat,
  FinancialCrimeReportStatus,
} from './entities/financial-crime-report.entity';

const XML = '<?xml version="1.0" encoding="UTF-8"?>\n<Report xmlns="urn:goAML"/>\n';

const RENDERED = {
  format: FinancialCrimeReportFormat.GOAML,
  xml: XML,
  context: {
    sar: { id: 'sar-1' },
    flag: { userId: 'user-1' },
    subject: { id: 'user-1' },
    kyc: null,
    transaction: { id: 'tx-1' },
  },
};

describe('FinancialCrimeReportService', () => {
  let service: FinancialCrimeReportService;
  let reportRepo: any;
  let goAml: any;
  let audit: any;

  beforeEach(async () => {
    reportRepo = {
      create: jest.fn((dto) => dto),
      save: jest.fn((entity) =>
        Promise.resolve({
          id: 'report-1',
          createdAt: new Date('2026-07-29T10:00:00.000Z'),
          ...entity,
        }),
      ),
      findOne: jest.fn(),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    goAml = { render: jest.fn().mockResolvedValue(RENDERED) };
    audit = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FinancialCrimeReportService,
        {
          provide: getRepositoryToken(FinancialCrimeReport),
          useValue: reportRepo,
        },
        { provide: GoAmlReportService, useValue: goAml },
        { provide: AuditLogsService, useValue: audit },
      ],
    }).compile();

    service = module.get(FinancialCrimeReportService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('generate', () => {
    it('stores the generated XML as a DRAFT report', async () => {
      const report = await service.generate({ sarId: 'sar-1' }, 'admin-1');

      expect(goAml.render).toHaveBeenCalledWith(
        'sar-1',
        FinancialCrimeReportFormat.GOAML,
      );
      expect(report.xmlContent).toBe(XML);
      expect(report.status).toBe(FinancialCrimeReportStatus.DRAFT);
      expect(report.submittedAt).toBeNull();
      expect(report.submissionReference).toBeNull();
      expect(report.generatedById).toBe('admin-1');
    });

    it('defaults to goAML when no format is given', async () => {
      const report = await service.generate({ sarId: 'sar-1' }, 'admin-1');
      expect(report.format).toBe(FinancialCrimeReportFormat.GOAML);
    });

    it('honours an explicit format', async () => {
      goAml.render.mockResolvedValue({
        ...RENDERED,
        format: FinancialCrimeReportFormat.NCA_UK,
      });

      const report = await service.generate(
        { sarId: 'sar-1', format: FinancialCrimeReportFormat.NCA_UK },
        'admin-1',
      );

      expect(goAml.render).toHaveBeenCalledWith(
        'sar-1',
        FinancialCrimeReportFormat.NCA_UK,
      );
      expect(report.format).toBe(FinancialCrimeReportFormat.NCA_UK);
    });

    it('writes a generation audit event', async () => {
      await service.generate({ sarId: 'sar-1' }, 'admin-1');

      expect(audit.log).toHaveBeenCalledWith(
        'admin-1',
        FINCRIME_REPORT_GENERATED,
        'FINANCIAL_CRIME_REPORT',
        'report-1',
        'SUCCESS',
        expect.objectContaining({
          sarId: 'sar-1',
          format: FinancialCrimeReportFormat.GOAML,
          schemaVersion: '4.0',
          subjectUserId: 'user-1',
          transactionId: 'tx-1',
        }),
      );
    });

    it('keeps the XML body out of the audit metadata', async () => {
      await service.generate({ sarId: 'sar-1' }, 'admin-1');

      const metadata = audit.log.mock.calls[0][5];
      expect(JSON.stringify(metadata)).not.toContain('urn:goAML');
      expect(metadata.xmlByteLength).toBe(Buffer.byteLength(XML, 'utf8'));
    });

    it('audits a failed generation attempt and rethrows', async () => {
      goAml.render.mockRejectedValue(
        new UnprocessableEntityException('no transaction linked'),
      );

      await expect(
        service.generate({ sarId: 'sar-1' }, 'admin-1'),
      ).rejects.toThrow(UnprocessableEntityException);

      expect(audit.log).toHaveBeenCalledWith(
        'admin-1',
        FINCRIME_REPORT_GENERATED,
        'FINANCIAL_CRIME_REPORT',
        null,
        'FAILURE',
        expect.objectContaining({
          sarId: 'sar-1',
          reason: 'no transaction linked',
        }),
      );
      expect(reportRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('omits the XML body and reports its size instead', async () => {
      reportRepo.findAndCount.mockResolvedValue([
        [
          {
            id: 'report-1',
            sarId: 'sar-1',
            format: FinancialCrimeReportFormat.GOAML,
            status: FinancialCrimeReportStatus.DRAFT,
            xmlContent: XML,
            createdAt: new Date(),
          },
        ],
        1,
      ]);

      const result = await service.list({});

      expect(result.total).toBe(1);
      expect(result.data[0]).not.toHaveProperty('xmlContent');
      expect(result.data[0].xmlByteLength).toBe(Buffer.byteLength(XML, 'utf8'));
      expect(result.data[0].status).toBe(FinancialCrimeReportStatus.DRAFT);
    });

    it('filters by status, format and sarId', async () => {
      await service.list({
        status: FinancialCrimeReportStatus.SUBMITTED,
        format: FinancialCrimeReportFormat.GOAML,
        sarId: 'sar-1',
        page: 2,
        limit: 5,
      });

      expect(reportRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: FinancialCrimeReportStatus.SUBMITTED,
            format: FinancialCrimeReportFormat.GOAML,
            sarId: 'sar-1',
          },
          skip: 5,
          take: 5,
        }),
      );
    });
  });

  describe('download', () => {
    it('returns the stored XML with a format-specific filename', async () => {
      reportRepo.findOne.mockResolvedValue({
        id: 'report-1',
        format: FinancialCrimeReportFormat.GOAML,
        xmlContent: XML,
        createdAt: new Date('2026-07-29T10:00:00.000Z'),
      });

      const result = await service.download('report-1');

      expect(result.xmlContent).toBe(XML);
      expect(result.filename).toBe('goaml-2026-07-29-report-1.xml');
    });

    it('throws NotFoundException for an unknown report', async () => {
      reportRepo.findOne.mockResolvedValue(null);

      await expect(service.download('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('markSubmitted', () => {
    const draft = () => ({
      id: 'report-1',
      sarId: 'sar-1',
      format: FinancialCrimeReportFormat.GOAML,
      status: FinancialCrimeReportStatus.DRAFT,
      xmlContent: XML,
      submittedAt: null,
      submissionReference: null,
      submittedById: null,
      createdAt: new Date(),
    });

    it('stores the regulator reference and moves to SUBMITTED', async () => {
      reportRepo.findOne.mockResolvedValue(draft());

      const saved = await service.markSubmitted(
        'report-1',
        { submissionReference: 'NFIU-STR-2026-004182' },
        'admin-1',
      );

      expect(saved.status).toBe(FinancialCrimeReportStatus.SUBMITTED);
      expect(saved.submissionReference).toBe('NFIU-STR-2026-004182');
      expect(saved.submittedAt).toBeInstanceOf(Date);
      expect(saved.submittedById).toBe('admin-1');
    });

    it('writes a submission audit event', async () => {
      reportRepo.findOne.mockResolvedValue(draft());

      await service.markSubmitted(
        'report-1',
        { submissionReference: 'NFIU-STR-2026-004182' },
        'admin-1',
      );

      expect(audit.log).toHaveBeenCalledWith(
        'admin-1',
        FINCRIME_REPORT_SUBMITTED,
        'FINANCIAL_CRIME_REPORT',
        'report-1',
        'SUCCESS',
        expect.objectContaining({
          sarId: 'sar-1',
          submissionReference: 'NFIU-STR-2026-004182',
        }),
      );
    });

    it('rejects a second submission and audits the attempt', async () => {
      reportRepo.findOne.mockResolvedValue({
        ...draft(),
        status: FinancialCrimeReportStatus.SUBMITTED,
        submissionReference: 'NFIU-STR-2026-000001',
      });

      await expect(
        service.markSubmitted(
          'report-1',
          { submissionReference: 'NFIU-STR-2026-004182' },
          'admin-1',
        ),
      ).rejects.toThrow(ConflictException);

      expect(audit.log).toHaveBeenCalledWith(
        'admin-1',
        FINCRIME_REPORT_SUBMITTED,
        'FINANCIAL_CRIME_REPORT',
        'report-1',
        'FAILURE',
        expect.objectContaining({
          reason: 'report is already SUBMITTED',
          existingSubmissionReference: 'NFIU-STR-2026-000001',
        }),
      );
      expect(reportRepo.save).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for an unknown report', async () => {
      reportRepo.findOne.mockResolvedValue(null);

      await expect(
        service.markSubmitted('missing', { submissionReference: 'x' }, 'admin-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
