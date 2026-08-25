import {
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Sar } from '../compliance/entities/sar.entity';
import { ComplianceFlag } from '../compliance/entities/compliance-flag.entity';
import { User } from '../../users/user.entity';
import { KycRecord, KycStatus } from '../../kyc/entities/kyc.entity';
import { Transaction } from '../../transactions/entities/transaction.entity';
import { FinancialCrimeReportFormat } from './entities/financial-crime-report.entity';
import {
  DEFAULT_REPORTING_INSTITUTION,
  ReportingInstitution,
  SarReportContext,
} from './sar-report-context';
import { REPORT_FORMATS } from './formats';
import { serializeXml } from './xml/xml-builder';
import {
  formatValidationErrors,
  renderXsd,
  validateXml,
  XmlValidationError,
} from './xml/xml-schema';

export interface GeneratedReportXml {
  format: FinancialCrimeReportFormat;
  xml: string;
  context: SarReportContext;
}

/**
 * Builds regulator-format XML from a filed SAR.
 *
 * Every document is validated against its format's schema before it leaves this
 * service, so an invalid submission cannot be persisted or downloaded.
 */
@Injectable()
export class GoAmlReportService {
  private readonly logger = new Logger(GoAmlReportService.name);

  constructor(
    @InjectRepository(Sar)
    private readonly sarRepo: Repository<Sar>,
    @InjectRepository(ComplianceFlag)
    private readonly flagRepo: Repository<ComplianceFlag>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(KycRecord)
    private readonly kycRepo: Repository<KycRecord>,
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Generate the goAML 4.0 XML for a SAR.
   *
   * @throws NotFoundException when the SAR does not exist.
   * @throws UnprocessableEntityException when the SAR cannot be expressed as a
   * goAML STR, or when the built document fails schema validation.
   */
  async generate(sarId: string): Promise<string> {
    const { xml } = await this.render(
      sarId,
      FinancialCrimeReportFormat.GOAML,
    );
    return xml;
  }

  /** Generate XML for any supported regulator format. */
  async render(
    sarId: string,
    format: FinancialCrimeReportFormat,
  ): Promise<GeneratedReportXml> {
    const definition = REPORT_FORMATS[format];
    if (!definition) {
      throw new UnprocessableEntityException(
        `Unsupported report format '${format}'`,
      );
    }

    const context = await this.loadContext(sarId);

    const blockers = definition.blockers?.(context) ?? [];
    if (blockers.length) {
      throw new UnprocessableEntityException(
        `Cannot generate a ${definition.label} report for SAR ${sarId}: ${blockers.join('; ')}.`,
      );
    }

    const document = definition.build(
      context,
      this.reportingInstitution(),
      new Date(),
    );

    const errors = validateXml(document, definition.schema);
    if (errors.length) {
      this.logValidationFailure(sarId, definition.label, errors);
      throw new UnprocessableEntityException(
        `Generated ${definition.label} document failed schema validation: ${formatValidationErrors(errors)}`,
      );
    }

    return { format, xml: serializeXml(document), context };
  }

  /**
   * The XSD for a format, rendered from the same model the validator uses.
   * Lets compliance staff verify our output with an external validator.
   */
  xsd(format: FinancialCrimeReportFormat): string {
    const definition = REPORT_FORMATS[format];
    if (!definition) {
      throw new UnprocessableEntityException(
        `Unsupported report format '${format}'`,
      );
    }
    return renderXsd(definition.schema);
  }

  async loadContext(sarId: string): Promise<SarReportContext> {
    const sar = await this.sarRepo.findOne({ where: { id: sarId } });
    if (!sar) {
      throw new NotFoundException(`SAR ${sarId} not found`);
    }

    const flag = await this.flagRepo.findOne({ where: { id: sar.flagId } });

    const subject = flag?.userId
      ? await this.userRepo.findOne({ where: { id: flag.userId } })
      : null;

    // Prefer the approved record — a rejected or pending submission is not
    // verified identity and must not be reported to a regulator as such.
    const kyc = flag?.userId
      ? ((await this.kycRepo.findOne({
          where: { userId: flag.userId, status: KycStatus.APPROVED },
          order: { reviewedAt: 'DESC' },
        })) ?? null)
      : null;

    const transaction = flag?.transactionId
      ? await this.transactionRepo.findOne({
          where: { id: flag.transactionId },
        })
      : null;

    return { sar, flag: flag ?? null, subject: subject ?? null, kyc, transaction };
  }

  private reportingInstitution(): ReportingInstitution {
    return {
      name:
        this.configService.get<string>('FINCRIME_REPORTING_NAME') ??
        DEFAULT_REPORTING_INSTITUTION.name,
      institutionName:
        this.configService.get<string>('FINCRIME_INSTITUTION_NAME') ??
        DEFAULT_REPORTING_INSTITUTION.institutionName,
      institutionCode:
        this.configService.get<string>('FINCRIME_INSTITUTION_CODE') ??
        DEFAULT_REPORTING_INSTITUTION.institutionCode,
      country:
        this.configService.get<string>('FINCRIME_INSTITUTION_COUNTRY') ??
        DEFAULT_REPORTING_INSTITUTION.country,
      reportingEntityId:
        this.configService.get<string>('FINCRIME_REPORTING_ENTITY_ID') ??
        DEFAULT_REPORTING_INSTITUTION.reportingEntityId,
    };
  }

  private logValidationFailure(
    sarId: string,
    label: string,
    errors: XmlValidationError[],
  ): void {
    this.logger.error(
      `${label} document for SAR ${sarId} failed schema validation: ${formatValidationErrors(
        errors,
      )}`,
    );
  }
}
