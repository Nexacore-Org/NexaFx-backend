import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FinancialCrimeReportsController } from './financial-crime-reports.controller';
import { FinancialCrimeReportService } from './financial-crime-report.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../users/user.entity';
import {
  FinancialCrimeReportFormat,
  FinancialCrimeReportStatus,
} from './entities/financial-crime-report.entity';

const XML = '<?xml version="1.0" encoding="UTF-8"?>\n<Report xmlns="urn:goAML"/>\n';

describe('FinancialCrimeReportsController', () => {
  let controller: FinancialCrimeReportsController;
  let service: jest.Mocked<FinancialCrimeReportService>;

  beforeEach(() => {
    service = {
      generate: jest.fn(),
      list: jest.fn(),
      download: jest.fn(),
      markSubmitted: jest.fn(),
      schema: jest.fn(),
    } as unknown as jest.Mocked<FinancialCrimeReportService>;

    controller = new FinancialCrimeReportsController(service);
  });

  afterEach(() => jest.clearAllMocks());

  it('generates a report for the requesting admin', async () => {
    const admin = { userId: 'admin-1' };
    await controller.generate(
      { sarId: 'sar-1', format: FinancialCrimeReportFormat.GOAML },
      admin,
    );

    expect(service.generate).toHaveBeenCalledWith(
      { sarId: 'sar-1', format: FinancialCrimeReportFormat.GOAML },
      'admin-1',
    );
  });

  it('lists reports with their status', async () => {
    service.list.mockResolvedValue({
      data: [
        {
          id: 'report-1',
          status: FinancialCrimeReportStatus.DRAFT,
        } as never,
      ],
      total: 1,
      page: 1,
      limit: 20,
    });

    const result = await controller.list({
      status: FinancialCrimeReportStatus.DRAFT,
    });

    expect(service.list).toHaveBeenCalledWith({
      status: FinancialCrimeReportStatus.DRAFT,
    });
    expect(result.total).toBe(1);
  });

  it('sends the XML as a downloadable attachment', async () => {
    service.download.mockResolvedValue({
      filename: 'goaml-2026-07-29-report-1.xml',
      xmlContent: XML,
    });

    const res = { set: jest.fn(), send: jest.fn() };
    await controller.download('report-1', res as never);

    expect(res.set).toHaveBeenCalledWith({
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition':
        'attachment; filename="goaml-2026-07-29-report-1.xml"',
      'Content-Length': String(Buffer.byteLength(XML, 'utf8')),
    });
    expect(res.send).toHaveBeenCalledWith(XML);
  });

  it('serves the format XSD as an attachment', () => {
    service.schema.mockReturnValue('<xs:schema/>');

    const res = { set: jest.fn(), send: jest.fn() };
    controller.schema(FinancialCrimeReportFormat.GOAML, res as never);

    expect(service.schema).toHaveBeenCalledWith(
      FinancialCrimeReportFormat.GOAML,
    );
    expect(res.set).toHaveBeenCalledWith(
      expect.objectContaining({
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': 'attachment; filename="goaml.xsd"',
      }),
    );
    expect(res.send).toHaveBeenCalledWith('<xs:schema/>');
  });

  it('records a submission reference', async () => {
    await controller.markSubmitted(
      'report-1',
      { submissionReference: 'NFIU-STR-2026-004182' },
      { userId: 'admin-1' },
    );

    expect(service.markSubmitted).toHaveBeenCalledWith(
      'report-1',
      { submissionReference: 'NFIU-STR-2026-004182' },
      'admin-1',
    );
  });

  describe('access control', () => {
    const guard = new RolesGuard(new Reflector());

    function contextFor(role: string | undefined): ExecutionContext {
      return {
        getType: () => 'http',
        getHandler: () => controller.generate,
        getClass: () => FinancialCrimeReportsController,
        switchToHttp: () => ({
          getRequest: () => (role ? { user: { role } } : {}),
        }),
      } as unknown as ExecutionContext;
    }

    it('declares the whole controller SUPER_ADMIN-only', () => {
      const roles = Reflect.getMetadata(
        ROLES_KEY,
        FinancialCrimeReportsController,
      );
      expect(roles).toEqual([UserRole.SUPER_ADMIN]);
    });

    it('allows a SUPER_ADMIN', () => {
      expect(guard.canActivate(contextFor(UserRole.SUPER_ADMIN))).toBe(true);
    });

    it.each([UserRole.ADMIN, UserRole.USER])(
      'returns 403 for %s',
      (role) => {
        expect(() => guard.canActivate(contextFor(role))).toThrow(
          ForbiddenException,
        );
      },
    );

    it('returns 403 when no role is present on the request', () => {
      expect(() => guard.canActivate(contextFor(undefined))).toThrow(
        ForbiddenException,
      );
    });
  });
});
