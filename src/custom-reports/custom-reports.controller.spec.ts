// @nestjs/typeorm and @nestjs/graphql ship as ESM-only, which the CommonJS jest
// runtime cannot load directly. Mock the decorators and guards.
jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));
jest.mock('@nestjs/graphql', () => ({
  GqlExecutionContext: {
    create: () => ({
      getContext: () => ({}),
    }),
  },
}));
jest.mock('../common/guards/jwt-auth.guard', () => ({
  JwtAuthGuard: class MockJwtAuthGuard {},
}));
jest.mock('../auth/guards/roles.guard', () => ({
  RolesGuard: class MockRolesGuard {},
}));

import { CustomReportsController } from './custom-reports.controller';
import { CustomReportsService } from './custom-reports.service';
import { ReportEntityTarget } from './entities/custom-report-definition.entity';

describe('CustomReportsController', () => {
  let controller: CustomReportsController;
  let service: jest.Mocked<
    Pick<
      CustomReportsService,
      'createDefinition' | 'listDefinitions' | 'getDefinition' | 'deleteDefinition' | 'runReport'
    >
  >;

  beforeEach(() => {
    service = {
      createDefinition: jest.fn(),
      listDefinitions: jest.fn(),
      getDefinition: jest.fn(),
      deleteDefinition: jest.fn(),
      runReport: jest.fn(),
    } as any;
    controller = new CustomReportsController(service as any);
  });

  describe('createDefinition', () => {
    it('delegates to service with dto and current user id', async () => {
      const dto = {
        name: 'Report 1',
        entity: ReportEntityTarget.USERS,
        filters: { role: 'ADMIN' },
        columns: ['id', 'email'],
      };
      const user = { userId: 'admin-uuid-1' };
      const expected = { id: 'def-1', ...dto } as any;
      service.createDefinition.mockResolvedValue(expected);

      const res = await controller.createDefinition(dto, user);

      expect(service.createDefinition).toHaveBeenCalledWith(dto, 'admin-uuid-1');
      expect(res).toBe(expected);
    });
  });

  describe('listDefinitions', () => {
    it('returns list from service', async () => {
      const list = [{ id: 'def-1' }, { id: 'def-2' }] as any;
      service.listDefinitions.mockResolvedValue(list);

      const res = await controller.listDefinitions();

      expect(service.listDefinitions).toHaveBeenCalled();
      expect(res).toBe(list);
    });
  });

  describe('getDefinition', () => {
    it('returns definition by id', async () => {
      const def = { id: '11111111-1111-1111-1111-111111111111' } as any;
      service.getDefinition.mockResolvedValue(def);

      const res = await controller.getDefinition('11111111-1111-1111-1111-111111111111');

      expect(service.getDefinition).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111');
      expect(res).toBe(def);
    });
  });

  describe('deleteDefinition', () => {
    it('deletes definition by id', async () => {
      service.deleteDefinition.mockResolvedValue({ deleted: true, id: '11111111-1111-1111-1111-111111111111' });

      const res = await controller.deleteDefinition('11111111-1111-1111-1111-111111111111');

      expect(service.deleteDefinition).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111');
      expect(res).toEqual({ deleted: true, id: '11111111-1111-1111-1111-111111111111' });
    });
  });

  describe('runReport', () => {
    it('runs report with json format by default', async () => {
      const mockRows = [{ id: '1', email: 'test@example.com' }];
      service.runReport.mockResolvedValue(mockRows);
      const res = { setHeader: jest.fn() } as any;

      const result = await controller.runReport(
        '11111111-1111-1111-1111-111111111111',
        {},
        res,
      );

      expect(service.runReport).toHaveBeenCalledWith(
        '11111111-1111-1111-1111-111111111111',
        'json',
        { limit: undefined, offset: undefined },
      );
      expect(res.setHeader).not.toHaveBeenCalled();
      expect(result).toBe(mockRows);
    });

    it('sets Content-Type text/csv and attachment headers when format is csv', async () => {
      const mockCsv = 'id,email\n"1","test@example.com"';
      service.runReport.mockResolvedValue(mockCsv);
      const res = { setHeader: jest.fn() } as any;

      const result = await controller.runReport(
        '11111111-1111-1111-1111-111111111111',
        { format: 'csv', limit: 50, offset: 10 },
        res,
      );

      expect(service.runReport).toHaveBeenCalledWith(
        '11111111-1111-1111-1111-111111111111',
        'csv',
        { limit: 50, offset: 10 },
      );
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="report-11111111-1111-1111-1111-111111111111.csv"',
      );
      expect(result).toBe(mockCsv);
    });
  });
});
