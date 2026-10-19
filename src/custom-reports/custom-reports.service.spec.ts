import { BadRequestException } from '@nestjs/common';
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
    Pick<Repository<CustomReportDefinition>, 'findOne' | 'create' | 'save'>
  >;

  const queryBuilder = {
    from: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
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
        'kyc_records',
        'kyc_records',
      );
      expect(queryBuilder.addSelect).toHaveBeenCalledWith(
        '"kyc_records"."reviewedAt"',
        'reviewedAt',
      );
      expect(queryBuilder.addSelect).toHaveBeenCalledWith(
        '"kyc_records"."userId"',
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
