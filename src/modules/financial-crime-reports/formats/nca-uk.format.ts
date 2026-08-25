import { branch, leaf, requiredLeaf, XmlNode } from '../xml/xml-builder';
import { XmlSchema } from '../xml/xml-schema';
import {
  formatXsdDate,
  formatXsdDateTime,
  formatXsdDecimal,
  ReportingInstitution,
  SarReportContext,
  subjectFullName,
} from '../sar-report-context';

/**
 * NCA (UK) Suspicious Activity Report.
 *
 * The UK National Crime Agency takes a flatter submission than goAML: a
 * reporter block, the subject, the activity being reported, and the disclosure
 * narrative. Included so the `NCA_UK` report format is generatable rather than
 * an enum value that fails at runtime; the goAML path is the one the NFIU
 * requirement in this issue is about.
 */

export const NCA_UK_NAMESPACE = 'urn:nca:sar';

const NCA_SAR_TYPES = ['SAR', 'DAML', 'DATF'] as const;

export const NCA_UK_SCHEMA: XmlSchema = {
  namespace: NCA_UK_NAMESPACE,
  version: '1.0',
  root: {
    name: 'SuspiciousActivityReport',
    documentation: 'NCA suspicious activity report disclosure.',
    children: [
      { name: 'SARType', enum: NCA_SAR_TYPES },
      { name: 'ReporterReference', maxLength: 50 },
      { name: 'SubmissionDate', type: 'dateTime' },
      {
        name: 'Reporter',
        children: [
          { name: 'OrganisationName', maxLength: 255 },
          { name: 'OrganisationCode', maxLength: 50 },
          { name: 'Country', pattern: { source: '[A-Z]{2}', describedAs: 'an ISO 3166-1 alpha-2 country code' } },
        ],
      },
      {
        name: 'Subject',
        children: [
          { name: 'FullName', maxLength: 200, minOccurs: 0 },
          { name: 'DateOfBirth', type: 'date', minOccurs: 0 },
          { name: 'Nationality', maxLength: 100, minOccurs: 0 },
          { name: 'EmailAddress', maxLength: 255, minOccurs: 0 },
          { name: 'TelephoneNumber', maxLength: 50, minOccurs: 0 },
          { name: 'AccountIdentifier', maxLength: 100, minOccurs: 0 },
        ],
      },
      {
        name: 'Activity',
        minOccurs: 0,
        children: [
          { name: 'ActivityReference', maxLength: 100 },
          { name: 'ActivityType', maxLength: 50 },
          { name: 'ActivityDate', type: 'dateTime' },
          { name: 'Amount', type: 'decimal' },
          { name: 'Currency', pattern: { source: '[A-Z]{3,10}', describedAs: 'a currency code' } },
        ],
      },
      {
        name: 'Disclosure',
        children: [
          { name: 'Reason', maxLength: 100 },
          { name: 'RiskScore', type: 'integer', minOccurs: 0 },
          { name: 'Narrative', maxLength: 8000 },
        ],
      },
    ],
  },
};

export function buildNcaUkDocument(
  context: SarReportContext,
  institution: ReportingInstitution,
  generatedAt: Date,
): XmlNode {
  const { sar, flag, subject, kyc, transaction } = context;

  return branch(
    'SuspiciousActivityReport',
    [
      requiredLeaf('SARType', 'SAR'),
      requiredLeaf('ReporterReference', sar.reportReference),
      requiredLeaf('SubmissionDate', formatXsdDateTime(generatedAt)),
      branch('Reporter', [
        requiredLeaf('OrganisationName', institution.institutionName),
        requiredLeaf('OrganisationCode', institution.institutionCode),
        requiredLeaf('Country', 'GB'),
      ]),
      branch('Subject', [
        leaf('FullName', subjectFullName(context)),
        leaf('DateOfBirth', formatXsdDate(kyc?.dateOfBirth)),
        leaf('Nationality', kyc?.nationality),
        leaf('EmailAddress', subject?.email),
        leaf('TelephoneNumber', subject?.phone),
        leaf('AccountIdentifier', subject?.walletPublicKey),
      ]),
      transaction
        ? branch('Activity', [
            requiredLeaf('ActivityReference', transaction.id),
            requiredLeaf('ActivityType', transaction.type),
            requiredLeaf('ActivityDate', formatXsdDateTime(transaction.createdAt)),
            requiredLeaf('Amount', formatXsdDecimal(transaction.amount)),
            requiredLeaf('Currency', transaction.currency),
          ])
        : null,
      branch('Disclosure', [
        requiredLeaf('Reason', flag?.rule ?? 'MANUAL_REFERRAL'),
        leaf('RiskScore', flag?.riskScore),
        requiredLeaf('Narrative', sar.narrative),
      ]),
    ],
    { xmlns: NCA_UK_NAMESPACE },
  );
}
