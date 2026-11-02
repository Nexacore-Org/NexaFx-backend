import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  CustomReportDefinition,
  ReportEntityTarget,
} from './entities/custom-report-definition.entity';
import { CreateReportDefinitionDto } from './dto/create-report-definition.dto';

@Injectable()
export class CustomReportsService {
  public static readonly MAX_ROW_CAP = 1000;
  public static readonly DEFAULT_LIMIT = 100;

  private readonly ALLOWED_FIELDS: Record<ReportEntityTarget, string[]> = {
    [ReportEntityTarget.TRANSACTIONS]: [
      'id',
      'amount',
      'currency',
      'status',
      'createdAt',
    ],
    [ReportEntityTarget.USERS]: [
      'id',
      'email',
      'role',
      'isActive',
      'kycTier',
      'createdAt',
    ],
    [ReportEntityTarget.KYC]: [
      'id',
      'userId',
      'targetTier',
      'tier',
      'status',
      'reviewedAt',
      'createdAt',
    ],
  };

  private readonly TARGET_ENTITIES: Record<ReportEntityTarget, string> = {
    [ReportEntityTarget.TRANSACTIONS]: 'transactions',
    [ReportEntityTarget.USERS]: 'users',
    [ReportEntityTarget.KYC]: 'kyc_applications',
  };

  constructor(
    @InjectRepository(CustomReportDefinition)
    private readonly reportRepo: Repository<CustomReportDefinition>,
    private readonly dataSource: DataSource,
  ) {}

  public async createDefinition(
    nameOrDto: string | CreateReportDefinitionDto,
    entityOrCreatedBy?: ReportEntityTarget | string,
    filters?: Record<string, any>,
    columns?: string[],
    createdBy?: string,
  ): Promise<CustomReportDefinition> {
    let name: string;
    let entity: ReportEntityTarget;
    let rawFilters: any;
    let rawColumns: any;
    let creatorId: string;

    if (typeof nameOrDto === 'object' && nameOrDto !== null) {
      name = nameOrDto.name;
      entity = nameOrDto.entity;
      rawFilters = nameOrDto.filters;
      rawColumns = nameOrDto.columns;
      creatorId = (entityOrCreatedBy as string) || 'admin';
    } else {
      name = nameOrDto;
      entity = entityOrCreatedBy as ReportEntityTarget;
      rawFilters = filters;
      rawColumns = columns;
      creatorId = (createdBy as string) || 'admin';
    }

    if (
      rawFilters === undefined ||
      rawFilters === null ||
      typeof rawFilters !== 'object' ||
      Array.isArray(rawFilters)
    ) {
      throw new BadRequestException('filters must be a valid object');
    }

    if (!Array.isArray(rawColumns) || rawColumns.length === 0) {
      throw new BadRequestException('columns must be a non-empty array');
    }

    this.validateAllowList(entity, rawColumns, Object.keys(rawFilters));

    const definition = this.reportRepo.create({
      name,
      entity,
      filters: rawFilters,
      columns: rawColumns,
      createdBy: creatorId,
    });
    return this.reportRepo.save(definition);
  }

  public async listDefinitions(): Promise<CustomReportDefinition[]> {
    return this.reportRepo.find({
      order: { createdAt: 'DESC' },
    });
  }

  public async getDefinition(id: string): Promise<CustomReportDefinition> {
    const definition = await this.reportRepo.findOne({ where: { id } });
    if (!definition) {
      throw new NotFoundException('Report definition not found');
    }
    return definition;
  }

  public async deleteDefinition(
    id: string,
  ): Promise<{ deleted: boolean; id: string }> {
    const definition = await this.getDefinition(id);
    await this.reportRepo.remove(definition);
    return { deleted: true, id };
  }

  public async runReport(
    id: string,
    format: 'json' | 'csv' = 'json',
    pagination?: { limit?: number; offset?: number },
  ): Promise<string | Record<string, unknown>[]> {
    const definition = await this.reportRepo.findOne({ where: { id } });
    if (!definition) {
      throw new NotFoundException('Report definition not found');
    }

    const filters = definition.filters || {};
    const columns = definition.columns || [];

    this.validateAllowList(
      definition.entity,
      columns,
      Object.keys(filters),
    );

    const tableName = this.TARGET_ENTITIES[definition.entity];
    const queryBuilder = this.dataSource
      .createQueryBuilder()
      .from(tableName, tableName);

    // Identifiers must be quoted: Postgres folds unquoted camelCase identifiers
    // to lowercase, so `transactions.createdAt` would fail with
    // `column transactions.createdat does not exist`. Every column is also
    // aliased back to its bare name, otherwise getRawMany() returns
    // `table_column` keys and the CSV export reads undefined for every cell.
    columns.forEach((col) => {
      queryBuilder.addSelect(`"${tableName}"."${col}"`, col);
    });

    // Apply safe parameterized filters
    Object.entries(filters).forEach(([field, value], index) => {
      queryBuilder.andWhere(`"${tableName}"."${field}" = :val${index}`, {
        [`val${index}`]: value,
      });
    });

    // Bound result size and apply pagination
    const requestedLimit =
      pagination?.limit !== undefined
        ? Number(pagination.limit)
        : CustomReportsService.MAX_ROW_CAP;
    const effectiveLimit = Math.min(
      Math.max(
        1,
        isNaN(requestedLimit)
          ? CustomReportsService.MAX_ROW_CAP
          : requestedLimit,
      ),
      CustomReportsService.MAX_ROW_CAP,
    );
    const offset = Math.max(0, Number(pagination?.offset) || 0);

    queryBuilder.limit(effectiveLimit).offset(offset);

    const rawData = await queryBuilder.getRawMany<Record<string, unknown>>();
    const boundedData = rawData.slice(0, CustomReportsService.MAX_ROW_CAP);

    if (format === 'csv') {
      return this.convertToCSV(columns, boundedData);
    }

    return boundedData;
  }

  private validateAllowList(
    entity: ReportEntityTarget,
    columns: string[],
    filterKeys: string[],
  ): void {
    const allowed = this.ALLOWED_FIELDS[entity];
    if (!allowed) {
      throw new BadRequestException('Invalid entity target');
    }

    for (const col of columns) {
      if (!allowed.includes(col)) {
        throw new BadRequestException(
          `Field '${col}' is not allowed for entity '${entity}'`,
        );
      }
    }

    for (const key of filterKeys) {
      if (!allowed.includes(key)) {
        throw new BadRequestException(
          `Filter key '${key}' is not allowed for entity '${entity}'`,
        );
      }
    }
  }

  private convertToCSV(
    columns: string[],
    rows: Record<string, unknown>[],
  ): string {
    const header = columns.join(',');
    const body = rows.map((row) =>
      columns
        .map((col) => {
          const val = row[col];
          if (val === null || val === undefined) {
            return '""';
          }
          let str =
            typeof val === 'object' ? JSON.stringify(val) : String(val);
          // Neutralize formula injection (=, +, -, @, \t, \r)
          if (/^[=+\-@\t\r]/.test(str)) {
            str = `'${str}`;
          }
          return `"${str.replace(/"/g, '""')}"`;
        })
        .join(','),
    );
    return [header, ...body].join('\n');
  }
}
