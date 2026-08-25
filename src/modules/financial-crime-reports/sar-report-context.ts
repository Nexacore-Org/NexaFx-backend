import { Sar } from '../compliance/entities/sar.entity';
import { ComplianceFlag } from '../compliance/entities/compliance-flag.entity';
import { User } from '../../users/user.entity';
import { KycRecord } from '../../kyc/entities/kyc.entity';
import { Transaction } from '../../transactions/entities/transaction.entity';

/**
 * Everything a regulator format needs about one SAR, assembled once so each
 * format builder is a pure function of this context.
 */
export interface SarReportContext {
  sar: Sar;
  /** The compliance flag the SAR was filed against. */
  flag: ComplianceFlag | null;
  /** The subject of the report. */
  subject: User | null;
  /** Verified identity for the subject, when KYC has been completed. */
  kyc: KycRecord | null;
  /** The transaction that triggered the flag, when the flag has one. */
  transaction: Transaction | null;
}

/** Details of the reporting institution, as they appear in the submission. */
export interface ReportingInstitution {
  name: string;
  institutionName: string;
  institutionCode: string;
  /** ISO 3166-1 alpha-2. */
  country: string;
  /** Identifier the regulator issued to us, when we have one. */
  reportingEntityId: string | null;
}

export const DEFAULT_REPORTING_INSTITUTION: ReportingInstitution = {
  name: 'NexaFX',
  institutionName: 'NexaFX Financial Services',
  institutionCode: 'NEXAFX',
  country: 'NG',
  reportingEntityId: null,
};

/** xsd:date — YYYY-MM-DD, in UTC. */
export function formatXsdDate(value: Date | string | null | undefined): string | null {
  const date = toDate(value);
  return date ? date.toISOString().slice(0, 10) : null;
}

/** xsd:dateTime without fractional seconds or offset, as goAML expects. */
export function formatXsdDateTime(
  value: Date | string | null | undefined,
): string | null {
  const date = toDate(value);
  return date ? date.toISOString().slice(0, 19) : null;
}

/**
 * xsd:decimal. Postgres numerics arrive as strings, and `Number` formatting can
 * produce exponent notation that xsd:decimal rejects, so clamp to a fixed scale.
 */
export function formatXsdDecimal(
  value: string | number | null | undefined,
  scale = 2,
): string | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(scale) : null;
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Best available display name for the subject of a report. */
export function subjectFullName(context: SarReportContext): string | null {
  if (context.kyc?.fullName) return context.kyc.fullName;
  const parts = [context.subject?.firstName, context.subject?.lastName].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length ? parts.join(' ') : null;
}
