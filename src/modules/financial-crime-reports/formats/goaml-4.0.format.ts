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
 * goAML 4.0 — the format the Nigerian Financial Intelligence Unit accepts for
 * Suspicious Transaction Reports.
 *
 * The element model below is the authority for both validation and the published
 * XSD. Element names, ordering and occurrence bounds follow the goAML 4.0
 * report structure: an identifying header, the reporting `Entity`, the `Reason`
 * narrative, the indicators that fired, the `Accounts` involved with their
 * signatory, and the `Transactions` being reported.
 */

export const GOAML_NAMESPACE = 'urn:goAML';

/** goAML report_code. STR = Suspicious Transaction Report. */
export const GOAML_REPORT_CODES = ['STR', 'CTR', 'AIF'] as const;

/** goAML submission_code. E = electronic submission by a reporting entity. */
export const GOAML_SUBMISSION_CODES = ['E', 'M', 'A'] as const;

export const GOAML_ACCOUNT_TYPES = [
  'WALLET',
  'CURRENT',
  'SAVINGS',
  'OTHER',
] as const;

const IDENTIFICATION_TYPES = [
  'PASSPORT',
  'NATIONAL_ID',
  'DRIVERS_LICENSE',
  'OTHER',
] as const;

const ISO_COUNTRY = {
  source: '[A-Z]{2}',
  describedAs: 'an ISO 3166-1 alpha-2 country code',
};

const ISO_CURRENCY = {
  source: '[A-Z]{3,10}',
  describedAs: 'a currency code',
};

export const GOAML_4_0_SCHEMA: XmlSchema = {
  namespace: GOAML_NAMESPACE,
  version: '4.0',
  root: {
    name: 'Report',
    documentation:
      'goAML 4.0 suspicious transaction report submitted to the NFIU.',
    children: [
      {
        name: 'Report_Code',
        enum: GOAML_REPORT_CODES,
        documentation: 'Type of report being submitted.',
      },
      { name: 'Submission_Code', enum: GOAML_SUBMISSION_CODES },
      {
        name: 'Entity_Reference',
        maxLength: 50,
        documentation: "The reporting entity's own reference for this report.",
      },
      { name: 'Submission_Date', type: 'dateTime' },
      {
        name: 'Entity',
        documentation: 'The reporting institution.',
        children: [
          { name: 'Name', maxLength: 100 },
          { name: 'Institution_Name', maxLength: 255 },
          { name: 'Institution_Code', maxLength: 50 },
          { name: 'Country', pattern: ISO_COUNTRY },
          { name: 'Reporting_Entity_ID', maxLength: 50, minOccurs: 0 },
        ],
      },
      {
        name: 'Reason',
        maxLength: 8000,
        documentation: 'Analyst narrative describing the suspicion.',
      },
      {
        name: 'Indicators',
        children: [
          {
            name: 'Indicator',
            maxLength: 100,
            maxOccurs: 'unbounded',
            documentation: 'The AML rule or typology that fired.',
          },
        ],
      },
      {
        name: 'Accounts',
        children: [
          {
            name: 'Account',
            maxOccurs: 'unbounded',
            children: [
              { name: 'Institution_Name', maxLength: 255 },
              { name: 'Account_Number', maxLength: 100 },
              { name: 'Account_Type', enum: GOAML_ACCOUNT_TYPES },
              { name: 'Currency_Code', pattern: ISO_CURRENCY, minOccurs: 0 },
              { name: 'Opened', type: 'date', minOccurs: 0 },
              {
                name: 'Signatory',
                minOccurs: 0,
                children: [
                  {
                    name: 'Person',
                    children: [
                      { name: 'First_Name', maxLength: 100, minOccurs: 0 },
                      { name: 'Last_Name', maxLength: 100, minOccurs: 0 },
                      { name: 'Full_Name', maxLength: 200, minOccurs: 0 },
                      { name: 'Birthdate', type: 'date', minOccurs: 0 },
                      {
                        name: 'Nationality1',
                        maxLength: 100,
                        minOccurs: 0,
                      },
                      {
                        name: 'Identification',
                        minOccurs: 0,
                        children: [
                          { name: 'Type', enum: IDENTIFICATION_TYPES },
                          { name: 'Number', maxLength: 100 },
                        ],
                      },
                      { name: 'Email', maxLength: 255, minOccurs: 0 },
                      { name: 'Phone', maxLength: 50, minOccurs: 0 },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        name: 'Transactions',
        children: [
          {
            name: 'Transaction',
            maxOccurs: 'unbounded',
            children: [
              { name: 'Transaction_Number', maxLength: 100 },
              { name: 'Transaction_Type', maxLength: 50 },
              { name: 'Date_Transaction', type: 'dateTime' },
              { name: 'Amount_Local', type: 'decimal' },
              { name: 'Currency_Code', pattern: ISO_CURRENCY },
              { name: 'Transaction_Status', maxLength: 50, minOccurs: 0 },
              { name: 'Conversion_Currency', pattern: ISO_CURRENCY, minOccurs: 0 },
              { name: 'Conversion_Amount', type: 'decimal', minOccurs: 0 },
              { name: 'Transaction_Reference', maxLength: 255, minOccurs: 0 },
              { name: 'Transaction_Description', maxLength: 4000, minOccurs: 0 },
            ],
          },
        ],
      },
    ],
  },
};

/**
 * Reasons a SAR cannot be expressed as a goAML STR. Surfaced to the operator so
 * they can fix the underlying record rather than submitting a document the NFIU
 * will reject.
 */
export function goAmlBlockers(context: SarReportContext): string[] {
  const blockers: string[] = [];
  if (!context.subject) {
    blockers.push(
      'the subject user record is missing, so no account holder can be reported',
    );
  } else if (!context.subject.walletPublicKey) {
    blockers.push('the subject has no wallet address to report as an account');
  }
  if (!context.transaction) {
    blockers.push(
      'the compliance flag has no linked transaction, and a goAML STR must report at least one',
    );
  }
  return blockers;
}

export function buildGoAmlDocument(
  context: SarReportContext,
  institution: ReportingInstitution,
  generatedAt: Date,
): XmlNode {
  const { sar, flag, subject, kyc, transaction } = context;

  return branch(
    'Report',
    [
      requiredLeaf('Report_Code', 'STR'),
      requiredLeaf('Submission_Code', 'E'),
      requiredLeaf('Entity_Reference', sar.reportReference),
      requiredLeaf('Submission_Date', formatXsdDateTime(generatedAt)),
      branch('Entity', [
        requiredLeaf('Name', institution.name),
        requiredLeaf('Institution_Name', institution.institutionName),
        requiredLeaf('Institution_Code', institution.institutionCode),
        requiredLeaf('Country', institution.country),
        leaf('Reporting_Entity_ID', institution.reportingEntityId),
      ]),
      requiredLeaf('Reason', sar.narrative),
      branch('Indicators', [
        requiredLeaf('Indicator', flag?.rule ?? 'MANUAL_REFERRAL'),
      ]),
      branch('Accounts', [
        branch('Account', [
          requiredLeaf('Institution_Name', institution.institutionName),
          requiredLeaf('Account_Number', subject?.walletPublicKey),
          requiredLeaf('Account_Type', 'WALLET'),
          leaf('Currency_Code', transaction?.currency),
          leaf('Opened', formatXsdDate(subject?.createdAt)),
          branch('Signatory', [
            branch('Person', [
              leaf('First_Name', subject?.firstName),
              leaf('Last_Name', subject?.lastName),
              leaf('Full_Name', subjectFullName(context)),
              leaf('Birthdate', formatXsdDate(kyc?.dateOfBirth)),
              leaf('Nationality1', kyc?.nationality),
              kyc?.documentNumber
                ? branch('Identification', [
                    requiredLeaf(
                      'Type',
                      kyc.documentType?.toUpperCase() ?? 'OTHER',
                    ),
                    requiredLeaf('Number', kyc.documentNumber),
                  ])
                : null,
              leaf('Email', subject?.email),
              leaf('Phone', subject?.phone),
            ]),
          ]),
        ]),
      ]),
      branch('Transactions', [
        transaction
          ? branch('Transaction', [
              requiredLeaf('Transaction_Number', transaction.id),
              requiredLeaf('Transaction_Type', transaction.type),
              requiredLeaf(
                'Date_Transaction',
                formatXsdDateTime(transaction.createdAt),
              ),
              requiredLeaf('Amount_Local', formatXsdDecimal(transaction.amount)),
              requiredLeaf('Currency_Code', transaction.currency),
              leaf('Transaction_Status', transaction.status),
              leaf('Conversion_Currency', transaction.toCurrency),
              leaf('Conversion_Amount', formatXsdDecimal(transaction.toAmount)),
              leaf(
                'Transaction_Reference',
                transaction.stellarTxHash ?? transaction.txHash,
              ),
              leaf('Transaction_Description', describeTransaction(context)),
            ])
          : null,
      ]),
    ],
    { xmlns: GOAML_NAMESPACE },
  );
}

function describeTransaction(context: SarReportContext): string | null {
  const { flag, transaction } = context;
  if (!transaction) return null;

  const parts = [
    `${transaction.type} of ${transaction.amount} ${transaction.currency}`,
  ];
  if (flag?.rule) {
    parts.push(`flagged by rule ${flag.rule}`);
  }
  if (typeof flag?.riskScore === 'number') {
    parts.push(`risk score ${flag.riskScore}`);
  }
  return parts.join('; ');
}
