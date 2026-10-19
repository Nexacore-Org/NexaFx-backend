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

@Injectable()
export class CustomReportsService {
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
      'tier',
      'status',
      'reviewedAt',
      'createdAt',
    ],
  };

  private readonly TARGET_ENTITIES: Record<ReportEntityTarget, string> = {
    [ReportEntityTarget.TRANSACTIONS]: 'transactions',
    [ReportEntityTarget.USERS]: 'users',
    [ReportEntityTarget.KYC]: 'kyc_records',
  };

  constructor(
    @InjectRepository(CustomReportDefinition)
    private readonly reportRepo: Repository<CustomReportDefinition>,
    private readonly dataSource: DataSource,
  ) {}

  public async createDefinition(
    name: string,
    entity: ReportEntityTarget,
    filters: Record<string, any>,
    columns: string[],
    createdBy: string,
  ): Promise<CustomReportDefinition> {
    this.validateAllowList(entity, columns, Object.keys(filters));

    const definition = this.reportRepo.create({
      name,
      entity,
      filters,
      columns,
      createdBy,
    });
    return this.reportRepo.save(definition);
  }

  public async runReport(
    id: string,
    format: 'json' | 'csv' = 'json',
  ): Promise<string | Record<string, unknown>[]> {
    const definition = await this.reportRepo.findOne({ where: { id } });
    if (!definition) {
      throw new NotFoundException('Report definition not found');
    }

    this.validateAllowList(
      definition.entity,
      definition.columns,
      Object.keys(definition.filters),
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
    definition.columns.forEach((col) => {
      queryBuilder.addSelect(`"${tableName}"."${col}"`, col);
    });

    // Apply safe parameterized filters
    Object.entries(definition.filters).forEach(([field, value], index) => {
      queryBuilder.andWhere(`"${tableName}"."${field}" = :val${index}`, {
        [`val${index}`]: value,
      });
    });

    const rawData = await queryBuilder.getRawMany<Record<string, unknown>>();

    if (format === 'csv') {
      return this.convertToCSV(definition.columns, rawData);
    }

    return rawData;
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
      columns.map((col) => JSON.stringify(row[col] ?? '')).join(','),
    );
    return [header, ...body].join('\n');
  }
}
