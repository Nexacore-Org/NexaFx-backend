import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { CustomReportsService } from './custom-reports.service';
import {
  CustomReportDefinition,
  ReportEntityTarget,
} from './entities/custom-report-definition.entity';

// @nestjs/typeorm ships as ESM-only, which the CommonJS jest runtime cannot
// load. The service only needs InjectRepository to exist as a decorator here.
jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));

describe('CustomReportsService', () => {
  let service: CustomReportsService;
  let definitionRepository: jest.Mocked<
    Pick<
      Repository<CustomReportDefinition>,
      'findOne' | 'create' | 'save' | 'find' | 'remove'
    >
  >;

  const queryBuilder = {
    from: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    getRawMany: jest.fn(),
  };

  const dataSource = {
    createQueryBuilder: jest.fn(() => queryBuilder),
  } as unknown as DataSource;

  const makeDefinition = (
    overrides: Partial<CustomReportDefinition> = {},
  ): CustomReportDefinition => ({
    id: 'definition-1',
    name: 'Report',
    createdBy: 'admin-1',
    entity: ReportEntityTarget.TRANSACTIONS,
    filters: {},
    columns: ['id', 'amount', 'currency', 'status', 'createdAt'],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    definitionRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      remove: jest.fn(),
    };
    service = new CustomReportsService(
      definitionRepository as unknown as Repository<CustomReportDefinition>,
      dataSource,
    );
  });

  describe('runReport quoting/aliasing (#1319)', () => {
    it('quotes every selected identifier', async () => {
      definitionRepository.findOne.mockResolvedValue(
        makeDefinition({
          entity: ReportEntityTarget.TRANSACTIONS,
          columns: ['id', 'amount', 'createdAt'],
        }),
      );
      queryBuilder.getRawMany.mockResolvedValue([]);

      await service.runReport('def-1', 'json');

      expect(queryBuilder.addSelect).toHaveBeenNthCalledWith(
        1,
        '"transactions"."id"',
        'id',
      );
      expect(queryBuilder.addSelect).toHaveBeenNthCalledWith(
        2,
        '"transactions"."amount"',
        'amount',
      );
      expect(queryBuilder.addSelect).toHaveBeenNthCalledWith(
        3,
        '"transactions"."createdAt"',
        'createdAt',
      );
    });

    it('aliases every column back to its bare name so raw rows are usable', async () => {
      definitionRepository.findOne.mockResolvedValue(
        makeDefinition({ columns: ['id', 'createdAt'] }),
      );
      queryBuilder.getRawMany.mockResolvedValue([
        { id: 'row-1', createdAt: '2026-01-01T00:00:00.000Z' },
      ]);

      const rows = (await service.runReport('def-1', 'json')) as Record<
        string,
        unknown
      >[];

      // The keys must match the requested columns exactly (not `table_column`).
      expect(Object.keys(rows[0])).toEqual(['id', 'createdAt']);
    });

    it('quotes the filtered column too', async () => {
      definitionRepository.findOne.mockResolvedValue(
        makeDefinition({ filters: { status: 'SUCCESS' } }),
      );
      queryBuilder.getRawMany.mockResolvedValue([]);

      await service.runReport('def-1', 'json');

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        '"transactions"."status" = :val0',
        { val0: 'SUCCESS' },
      );
    });

    it('queries the KYC table with a camelCase column', async () => {
      definitionRepository.findOne.mockResolvedValue(
        makeDefinition({
          entity: ReportEntityTarget.KYC,
          columns: ['id', 'userId', 'reviewedAt'],
          filters: {},
        }),
      );
      queryBuilder.getRawMany.mockResolvedValue([]);

      await service.runReport('def-1', 'json');

      expect(queryBuilder.from).toHaveBeenCalledWith(
        'kyc_applications',
        'kyc_applications',
      );
      expect(queryBuilder.addSelect).toHaveBeenCalledWith(
        '"kyc_applications"."reviewedAt"',
        'reviewedAt',
      );
      expect(queryBuilder.addSelect).toHaveBeenCalledWith(
        '"kyc_applications"."userId"',
        'userId',
      );
    });
  });

  describe('CSV export', () => {
    it('writes the header and one line per row with every cell populated', async () => {
      definitionRepository.findOne.mockResolvedValue(
        makeDefinition({
          columns: ['id', 'amount', 'currency', 'status', 'createdAt'],
        }),
      );
      queryBuilder.getRawMany.mockResolvedValue([
        {
          id: '11111111-1111-1111-1111-111111111111',
          amount: '100',
          currency: 'USD',
          status: 'SUCCESS',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ]);

      const csv = (await service.runReport('def-1', 'csv')) as string;
      const [header, row] = csv.split('\n');

      expect(header).toBe('id,amount,currency,status,createdAt');
      expect(row).toContain('11111111-1111-1111-1111-111111111111');
      expect(row).toContain('100');
      expect(row).toContain('USD');
      expect(row).toContain('SUCCESS');
      expect(row).toContain('2026-01-01T00:00:00.000Z');
      expect(row).not.toMatch(/^,|,,|,$/);
    });

    it('exports values for the [id, createdAt] column selection', async () => {
      definitionRepository.findOne.mockResolvedValue(
        makeDefinition({ columns: ['id', 'createdAt'] }),
      );
      queryBuilder.getRawMany.mockResolvedValue([
        {
          id: '22222222-2222-2222-2222-222222222222',
          createdAt: '2026-02-02T10:00:00.000Z',
        },
      ]);

      const csv = (await service.runReport('def-2', 'csv')) as string;
      const [header, row] = csv.split('\n');

      expect(header).toBe('id,createdAt');
      expect(row).toContain('22222222-2222-2222-2222-222222222222');
      expect(row).toContain('2026-02-02T10:00:00.000Z');
      expect(row).not.toBe('"",""');
    });

    it('exports an empty CSV body when the report has no rows', async () => {
      definitionRepository.findOne.mockResolvedValue(
        makeDefinition({ columns: ['id', 'createdAt'] }),
      );
      queryBuilder.getRawMany.mockResolvedValue([]);

      const csv = (await service.runReport('def-1', 'csv')) as string;

      expect(csv).toBe('id,createdAt');
    });

    it('neutralizes formula injection characters (=, +, -, @) in CSV cells', async () => {
      definitionRepository.findOne.mockResolvedValue(
        makeDefinition({
          columns: ['id', 'status'],
        }),
      );
      queryBuilder.getRawMany.mockResolvedValue([
        {
          id: '=cmd|/c calc!A0',
          status: '+12345',
        },
        {
          id: '@SUM(1,2)',
          status: '-danger',
        },
      ]);

      const csv = (await service.runReport('def-1', 'csv')) as string;
      const lines = csv.split('\n');

      expect(lines[1]).toContain("'=cmd|/c calc!A0");
      expect(lines[1]).toContain("'+12345");
      expect(lines[2]).toContain("'@SUM(1,2)");
      expect(lines[2]).toContain("'-danger");
    });
  });

  describe('definition management and validation', () => {
    it('throws BadRequestException when filters is undefined or not an object', async () => {
      await expect(
        service.createDefinition('Report', ReportEntityTarget.USERS, undefined as any, ['id'], 'admin-1'),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        service.createDefinition({
          name: 'Report',
          entity: ReportEntityTarget.USERS,
          filters: null as any,
          columns: ['id'],
        }, 'admin-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException when columns is not an array or empty', async () => {
      await expect(
        service.createDefinition('Report', ReportEntityTarget.USERS, {}, undefined as any, 'admin-1'),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        service.createDefinition('Report', ReportEntityTarget.USERS, {}, [], 'admin-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('successfully creates definition with valid input', async () => {
      const mockCreated = makeDefinition({ name: 'Custom Def' });
      definitionRepository.create.mockReturnValue(mockCreated as any);
      definitionRepository.save.mockResolvedValue(mockCreated);

      const result = await service.createDefinition({
        name: 'Custom Def',
        entity: ReportEntityTarget.USERS,
        filters: { role: 'ADMIN' },
        columns: ['id', 'email'],
      }, 'admin-1');

      expect(definitionRepository.create).toHaveBeenCalledWith({
        name: 'Custom Def',
        entity: ReportEntityTarget.USERS,
        filters: { role: 'ADMIN' },
        columns: ['id', 'email'],
        createdBy: 'admin-1',
      });
      expect(result.name).toBe('Custom Def');
    });

    it('listDefinitions returns definitions ordered by createdAt DESC', async () => {
      const mockList = [makeDefinition({ id: 'def-1' }), makeDefinition({ id: 'def-2' })];
      definitionRepository.find.mockResolvedValue(mockList);

      const res = await service.listDefinitions();

      expect(definitionRepository.find).toHaveBeenCalledWith({
        order: { createdAt: 'DESC' },
      });
      expect(res).toEqual(mockList);
    });

    it('getDefinition returns the definition by id', async () => {
      const mockDef = makeDefinition({ id: 'def-1' });
      definitionRepository.findOne.mockResolvedValue(mockDef);

      const res = await service.getDefinition('def-1');

      expect(definitionRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'def-1' },
      });
      expect(res).toEqual(mockDef);
    });

    it('getDefinition throws NotFoundException when definition is not found', async () => {
      definitionRepository.findOne.mockResolvedValue(null);

      await expect(service.getDefinition('def-missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('deleteDefinition removes the definition by id', async () => {
      const mockDef = makeDefinition({ id: 'def-1' });
      definitionRepository.findOne.mockResolvedValue(mockDef);
      definitionRepository.remove.mockResolvedValue(mockDef);

      const res = await service.deleteDefinition('def-1');

      expect(definitionRepository.remove).toHaveBeenCalledWith(mockDef);
      expect(res).toEqual({ deleted: true, id: 'def-1' });
    });
  });

  describe('bounding and pagination', () => {
    it('applies row cap and offset to query builder', async () => {
      definitionRepository.findOne.mockResolvedValue(makeDefinition());
      queryBuilder.getRawMany.mockResolvedValue([]);

      await service.runReport('def-1', 'json', { limit: 50, offset: 25 });

      expect(queryBuilder.limit).toHaveBeenCalledWith(50);
      expect(queryBuilder.offset).toHaveBeenCalledWith(25);
    });

    it('bounds limit to MAX_ROW_CAP when requested limit exceeds cap', async () => {
      definitionRepository.findOne.mockResolvedValue(makeDefinition());
      queryBuilder.getRawMany.mockResolvedValue([]);

      await service.runReport('def-1', 'json', { limit: 999999, offset: 0 });

      expect(queryBuilder.limit).toHaveBeenCalledWith(CustomReportsService.MAX_ROW_CAP);
    });

    it('never returns more than MAX_ROW_CAP even if raw query returns more', async () => {
      definitionRepository.findOne.mockResolvedValue(makeDefinition());
      const hugeData = Array.from({ length: 1500 }, (_, i) => ({
        id: `row-${i}`,
      }));
      queryBuilder.getRawMany.mockResolvedValue(hugeData);

      const rows = (await service.runReport('def-1', 'json')) as any[];

      expect(rows.length).toBe(CustomReportsService.MAX_ROW_CAP);
    });
  });

  describe('allowlist', () => {
    it('allows users.isActive and users.role', async () => {
      definitionRepository.findOne.mockResolvedValue(
        makeDefinition({
          entity: ReportEntityTarget.USERS,
          columns: ['id', 'email', 'role', 'isActive'],
        }),
      );
      queryBuilder.getRawMany.mockResolvedValue([]);

      await expect(service.runReport('def-1')).resolves.toEqual([]);
      expect(queryBuilder.addSelect).toHaveBeenCalledWith(
        '"users"."isActive"',
        'isActive',
      );
    });

    it('rejects users.status, which is not a users column', async () => {
      definitionRepository.findOne.mockResolvedValue(
        makeDefinition({
          entity: ReportEntityTarget.USERS,
          columns: ['id', 'status'],
        }),
      );

      await expect(service.runReport('def-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(queryBuilder.getRawMany).not.toHaveBeenCalled();
    });

    it('allows kyc reviewedAt', async () => {
      definitionRepository.findOne.mockResolvedValue(
        makeDefinition({
          entity: ReportEntityTarget.KYC,
          columns: ['id', 'reviewedAt'],
        }),
      );
      queryBuilder.getRawMany.mockResolvedValue([]);

      await expect(service.runReport('def-1')).resolves.toEqual([]);
    });

    it('rejects the non-existent kyc verifiedAt column', async () => {
      definitionRepository.findOne.mockResolvedValue(
        makeDefinition({
          entity: ReportEntityTarget.KYC,
          columns: ['id', 'verifiedAt'],
        }),
      );

      await expect(service.runReport('def-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('missing definition', () => {
    it('throws when the definition does not exist', async () => {
      definitionRepository.findOne.mockResolvedValue(null);

      await expect(service.runReport('missing')).rejects.toThrow(
        'Report definition not found',
      );
    });
  });
});
