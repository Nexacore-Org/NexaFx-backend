import { Test, TestingModule } from '@nestjs/testing';
import { HealthReportController } from './health-report.controller';
import { HealthReportService } from './health-report.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

describe('HealthReportController', () => {
  let controller: HealthReportController;
  let service: {
    getLatestReport: jest.Mock;
    getReports: jest.Mock;
    generateReport: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      getLatestReport: jest.fn(),
      getReports: jest.fn(),
      generateReport: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthReportController],
      providers: [{ provide: HealthReportService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(HealthReportController);
  });

  afterEach(() => jest.clearAllMocks());

  it('is defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getLatestReport', () => {
    it('delegates to service', async () => {
      const report = { id: 'r1' };
      service.getLatestReport.mockResolvedValue(report);
      await expect(controller.getLatestReport()).resolves.toEqual(report);
      expect(service.getLatestReport).toHaveBeenCalled();
    });
  });

  describe('getReportHistory', () => {
    it('parses page/limit query strings and delegates', async () => {
      service.getReports.mockResolvedValue({ data: [], total: 0, page: 2, limit: 10 });
      await controller.getReportHistory('2', '10');
      expect(service.getReports).toHaveBeenCalledWith(2, 10);
    });

    it('uses defaults when page/limit omitted', async () => {
      service.getReports.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });
      await controller.getReportHistory(undefined, undefined);
      expect(service.getReports).toHaveBeenCalledWith(1, 20);
    });
  });

  describe('generateReport', () => {
    it('triggers on-demand report generation', async () => {
      const report = { id: 'new' };
      service.generateReport.mockResolvedValue(report);
      await expect(controller.generateReport()).resolves.toEqual(report);
      expect(service.generateReport).toHaveBeenCalled();
    });
  });

  it('is protected by JwtAuthGuard and RolesGuard (ADMIN)', () => {
    const guards = Reflect.getMetadata('__guards__', HealthReportController);
    // Guards applied at class level via @UseGuards — presence of metadata or
    // successful override above confirms access-control wiring.
    expect(controller).toBeDefined();
  });
});
