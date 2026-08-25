import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import {
  FinancialCrimeReport,
  FinancialCrimeReportFormat,
  FinancialCrimeReportStatus,
} from './entities/financial-crime-report.entity';
import { GoAmlReportService } from './goaml-report.service';
import { REPORT_FORMATS } from './formats';
import { GenerateReportDto } from './dto/generate-report.dto';
import { ListReportsDto } from './dto/list-reports.dto';
import { MarkSubmittedDto } from './dto/mark-submitted.dto';

export const FINCRIME_REPORT_GENERATED = 'compliance.fincrime_report_generated';
export const FINCRIME_REPORT_SUBMITTED = 'compliance.fincrime_report_submitted';
const AUDIT_RESOURCE = 'FINANCIAL_CRIME_REPORT';

/** Report fields safe to return in a list — excludes the XML body. */
export type FinancialCrimeReportSummary = Omit<
  FinancialCrimeReport,
  'xmlContent' | 'sar'
> & { xmlByteLength: number };

export interface DownloadableReport {
  filename: string;
  xmlContent: string;
}

@Injectable()
export class FinancialCrimeReportService {
  private readonly logger = new Logger(FinancialCrimeReportService.name);

  constructor(
    @InjectRepository(FinancialCrimeReport)
    private readonly reportRepo: Repository<FinancialCrimeReport>,
    private readonly goAmlReportService: GoAmlReportService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  /**
   * Generate and persist a regulator report for a SAR.
   *
   * Both outcomes are audited: a compliance trail has to show the attempts that
   * failed as well as the documents that were produced.
   */
  async generate(
    dto: GenerateReportDto,
    actorId: string,
  ): Promise<FinancialCrimeReport> {
    const format = dto.format ?? FinancialCrimeReportFormat.GOAML;

    let generated: Awaited<ReturnType<GoAmlReportService['render']>>;
    try {
      generated = await this.goAmlReportService.render(dto.sarId, format);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      await this.audit(
        actorId,
        FINCRIME_REPORT_GENERATED,
        null,
        'FAILURE',
        { sarId: dto.sarId, format, reason: message },
      );
      throw error;
    }

    const report = await this.reportRepo.save(
      this.reportRepo.create({
        sarId: dto.sarId,
        format,
        xmlContent: generated.xml,
        status: FinancialCrimeReportStatus.DRAFT,
        generatedById: actorId,
        submittedAt: null,
        submissionReference: null,
        submittedById: null,
      }),
    );

    await this.audit(actorId, FINCRIME_REPORT_GENERATED, report.id, 'SUCCESS', {
      sarId: dto.sarId,
      format,
      schemaVersion: REPORT_FORMATS[format].schema.version,
      xmlByteLength: Buffer.byteLength(generated.xml, 'utf8'),
      subjectUserId: generated.context.flag?.userId ?? null,
      transactionId: generated.context.transaction?.id ?? null,
    });

    return report;
  }

  async list(query: ListReportsDto): Promise<{
    data: FinancialCrimeReportSummary[];
    total: number;
    page: number;
    limit: number;
  }> {
    const where: FindOptionsWhere<FinancialCrimeReport> = {};
    if (query.status) where.status = query.status;
    if (query.format) where.format = query.format;
    if (query.sarId) where.sarId = query.sarId;

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const [rows, total] = await this.reportRepo.findAndCount({
      where,
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return { data: rows.map(toSummary), total, page, limit };
  }

  /** The XSD a format's documents are validated against. */
  schema(format: FinancialCrimeReportFormat): string {
    return this.goAmlReportService.xsd(format);
  }

  async findOne(id: string): Promise<FinancialCrimeReport> {
    const report = await this.reportRepo.findOne({ where: { id } });
    if (!report) {
      throw new NotFoundException(`Financial crime report ${id} not found`);
    }
    return report;
  }

  async download(id: string): Promise<DownloadableReport> {
    const report = await this.findOne(id);
    const prefix = REPORT_FORMATS[report.format]?.filePrefix ?? 'report';
    const stamp = report.createdAt.toISOString().slice(0, 10);

    return {
      filename: `${prefix}-${stamp}-${report.id}.xml`,
      xmlContent: report.xmlContent,
    };
  }

  /**
   * Record that a report was submitted to the regulator out of band, storing the
   * reference they returned.
   */
  async markSubmitted(
    id: string,
    dto: MarkSubmittedDto,
    actorId: string,
  ): Promise<FinancialCrimeReport> {
    const report = await this.findOne(id);

    if (report.status !== FinancialCrimeReportStatus.DRAFT) {
      await this.audit(actorId, FINCRIME_REPORT_SUBMITTED, id, 'FAILURE', {
        reason: `report is already ${report.status}`,
        existingSubmissionReference: report.submissionReference,
      });
      throw new ConflictException(
        `Report ${id} is already ${report.status} and cannot be marked submitted again`,
      );
    }

    report.status = FinancialCrimeReportStatus.SUBMITTED;
    report.submissionReference = dto.submissionReference;
    report.submittedAt = new Date();
    report.submittedById = actorId;

    const saved = await this.reportRepo.save(report);

    await this.audit(actorId, FINCRIME_REPORT_SUBMITTED, id, 'SUCCESS', {
      sarId: saved.sarId,
      format: saved.format,
      submissionReference: saved.submissionReference,
      submittedAt: saved.submittedAt?.toISOString(),
    });

    return saved;
  }

  /**
   * Audit writes are awaited rather than fired off: for a financial crime report
   * the trail is part of the regulatory obligation, so a lost entry matters more
   * than the extra round trip. AuditLogsService.log swallows its own errors, so
   * this still cannot fail the operation.
   */
  private async audit(
    actorId: string,
    action: string,
    resourceId: string | null,
    status: 'SUCCESS' | 'FAILURE',
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.auditLogsService.log(
      actorId,
      action,
      AUDIT_RESOURCE,
      resourceId,
      status,
      metadata,
    );
    if (status === 'FAILURE') {
      this.logger.warn(`${action} failed: ${JSON.stringify(metadata)}`);
    }
  }
}

function toSummary(report: FinancialCrimeReport): FinancialCrimeReportSummary {
  const { xmlContent, sar: _sar, ...rest } = report;
  return { ...rest, xmlByteLength: Buffer.byteLength(xmlContent ?? '', 'utf8') };
}
