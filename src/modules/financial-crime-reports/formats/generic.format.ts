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
 * Generic SAR export.
 *
 * A regulator-neutral rendering of the same SAR for jurisdictions we have no
 * dedicated format for yet, and for internal review. Every subject and activity
 * field is optional so a report can always be produced — unlike goAML, this
 * format is not submitted to anyone, so a partial record is better than none.
 */

export const GENERIC_NAMESPACE = 'urn:nexafx:sar';

export const GENERIC_SCHEMA: XmlSchema = {
  namespace: GENERIC_NAMESPACE,
  version: '1.0',
  root: {
    name: 'SuspiciousActivityReport',
    documentation: 'Regulator-neutral suspicious activity report export.',
    children: [
      { name: 'Reference', maxLength: 50 },
      { name: 'GeneratedAt', type: 'dateTime' },
      { name: 'FiledAt', type: 'dateTime' },
      {
        name: 'Reporter',
        children: [
          { name: 'Name', maxLength: 255 },
          { name: 'Code', maxLength: 50 },
          { name: 'Country', maxLength: 2 },
        ],
      },
      {
        name: 'Subject',
        children: [
          { name: 'UserId', maxLength: 64, minOccurs: 0 },
          { name: 'FullName', maxLength: 200, minOccurs: 0 },
          { name: 'DateOfBirth', type: 'date', minOccurs: 0 },
          { name: 'Nationality', maxLength: 100, minOccurs: 0 },
          { name: 'Email', maxLength: 255, minOccurs: 0 },
          { name: 'Phone', maxLength: 50, minOccurs: 0 },
          { name: 'AccountIdentifier', maxLength: 100, minOccurs: 0 },
          { name: 'AccountOpened', type: 'date', minOccurs: 0 },
        ],
      },
      {
        name: 'Flag',
        minOccurs: 0,
        children: [
          { name: 'Rule', maxLength: 100 },
          { name: 'RiskScore', type: 'integer', minOccurs: 0 },
          { name: 'Status', maxLength: 30, minOccurs: 0 },
          { name: 'RaisedAt', type: 'dateTime', minOccurs: 0 },
        ],
      },
      {
        name: 'Transaction',
        minOccurs: 0,
        children: [
          { name: 'TransactionId', maxLength: 64 },
          { name: 'Type', maxLength: 50, minOccurs: 0 },
          { name: 'Status', maxLength: 50, minOccurs: 0 },
          { name: 'Amount', type: 'decimal', minOccurs: 0 },
          { name: 'Currency', maxLength: 10, minOccurs: 0 },
          { name: 'OccurredAt', type: 'dateTime', minOccurs: 0 },
        ],
      },
      { name: 'Narrative', maxLength: 8000 },
    ],
  },
};

export function buildGenericDocument(
  context: SarReportContext,
  institution: ReportingInstitution,
  generatedAt: Date,
): XmlNode {
  const { sar, flag, subject, kyc, transaction } = context;

  return branch(
    'SuspiciousActivityReport',
    [
      requiredLeaf('Reference', sar.reportReference),
      requiredLeaf('GeneratedAt', formatXsdDateTime(generatedAt)),
      requiredLeaf('FiledAt', formatXsdDateTime(sar.filedAt) ?? formatXsdDateTime(generatedAt)),
      branch('Reporter', [
        requiredLeaf('Name', institution.institutionName),
        requiredLeaf('Code', institution.institutionCode),
        requiredLeaf('Country', institution.country),
      ]),
      branch('Subject', [
        leaf('UserId', subject?.id ?? flag?.userId),
        leaf('FullName', subjectFullName(context)),
        leaf('DateOfBirth', formatXsdDate(kyc?.dateOfBirth)),
        leaf('Nationality', kyc?.nationality),
        leaf('Email', subject?.email),
        leaf('Phone', subject?.phone),
        leaf('AccountIdentifier', subject?.walletPublicKey),
        leaf('AccountOpened', formatXsdDate(subject?.createdAt)),
      ]),
      flag
        ? branch('Flag', [
            requiredLeaf('Rule', flag.rule),
            leaf('RiskScore', flag.riskScore),
            leaf('Status', flag.status),
            leaf('RaisedAt', formatXsdDateTime(flag.createdAt)),
          ])
        : null,
      transaction
        ? branch('Transaction', [
            requiredLeaf('TransactionId', transaction.id),
            leaf('Type', transaction.type),
            leaf('Status', transaction.status),
            leaf('Amount', formatXsdDecimal(transaction.amount)),
            leaf('Currency', transaction.currency),
            leaf('OccurredAt', formatXsdDateTime(transaction.createdAt)),
          ])
        : null,
      requiredLeaf('Narrative', sar.narrative),
    ],
    { xmlns: GENERIC_NAMESPACE },
  );
}
