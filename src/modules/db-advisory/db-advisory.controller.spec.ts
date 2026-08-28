import { Test, TestingModule } from '@nestjs/testing';
import { DbAdvisoryController } from './db-advisory.controller';
import { IndexAdvisorService } from './index-advisor.service';
import { mock, DeepMockProxy } from 'jest-mock-extended';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Reflector } from '@nestjs/core';

describe('DbAdvisoryController', () => {
  let controller: DbAdvisoryController;
  let service: DeepMockProxy<IndexAdvisorService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DbAdvisoryController],
      providers: [
        {
          provide: IndexAdvisorService,
          useValue: mock<IndexAdvisorService>(),
        },
        {
          provide: RolesGuard,
          useValue: mock<RolesGuard>(),
        },
        {
          provide: Reflector,
          useValue: mock<Reflector>(),
        },
      ],
    }).compile();

    controller = module.get<DbAdvisoryController>(DbAdvisoryController);
    service = module.get(IndexAdvisorService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getLatestReport', () => {
    it('should call the service to get the latest report', async () => {
      await controller.getLatestReport();
      expect(service.getLatestReport).toHaveBeenCalled();
    });
  });

  describe('getReportHistory', () => {
    it('should call the service to get report history', async () => {
      await controller.getReportHistory(1, 10);
      expect(service.getReportHistory).toHaveBeenCalledWith(1, 10);
    });
  });

  describe('runAnalysis', () => {
    it('should call the service to run analysis', async () => {
      await controller.runAnalysis();
      expect(service.analyse).toHaveBeenCalled();
    });
  });

  describe('getLatestMigration', () => {
    it('should call the service to get the latest migration SQL', async () => {
      service.getLatestMigrationSQL.mockResolvedValue('CREATE INDEX foo;');
      const result = await controller.getLatestMigration();
      expect(service.getLatestMigrationSQL).toHaveBeenCalled();
      expect(result).toEqual({ sql: 'CREATE INDEX foo;' });
    });
  });
});
