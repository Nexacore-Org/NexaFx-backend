import { XmlNode } from '../xml/xml-builder';
import { XmlSchema } from '../xml/xml-schema';
import { ReportingInstitution, SarReportContext } from '../sar-report-context';
import { FinancialCrimeReportFormat } from '../entities/financial-crime-report.entity';
import {
  buildGoAmlDocument,
  goAmlBlockers,
  GOAML_4_0_SCHEMA,
} from './goaml-4.0.format';
import { buildNcaUkDocument, NCA_UK_SCHEMA } from './nca-uk.format';
import { buildGenericDocument, GENERIC_SCHEMA } from './generic.format';

export * from './goaml-4.0.format';
export * from './nca-uk.format';
export * from './generic.format';

export interface ReportFormatDefinition {
  /** Human-readable regulator and format, used in error messages. */
  label: string;
  schema: XmlSchema;
  build: (
    context: SarReportContext,
    institution: ReportingInstitution,
    generatedAt: Date,
  ) => XmlNode;
  /**
   * Preconditions this format cannot express a document without. Returning a
   * non-empty list fails generation before an invalid document is built, so the
   * operator is told what to fix rather than handed XML the regulator rejects.
   */
  blockers?: (context: SarReportContext) => string[];
  /** Filename stem for the download endpoint. */
  filePrefix: string;
}

export const REPORT_FORMATS: Record<
  FinancialCrimeReportFormat,
  ReportFormatDefinition
> = {
  [FinancialCrimeReportFormat.GOAML]: {
    label: 'goAML 4.0 (NFIU, Nigeria)',
    schema: GOAML_4_0_SCHEMA,
    build: buildGoAmlDocument,
    blockers: goAmlBlockers,
    filePrefix: 'goaml',
  },
  [FinancialCrimeReportFormat.NCA_UK]: {
    label: 'NCA SAR (United Kingdom)',
    schema: NCA_UK_SCHEMA,
    build: buildNcaUkDocument,
    filePrefix: 'nca-uk-sar',
  },
  [FinancialCrimeReportFormat.GENERIC]: {
    label: 'Generic SAR export',
    schema: GENERIC_SCHEMA,
    build: buildGenericDocument,
    filePrefix: 'sar',
  },
};
