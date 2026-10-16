import * as crypto from 'crypto';
import {
  WebhookEnvelope,
  WebhookEnvelopeOptions,
  WebhookPayloadBuilder,
} from './webhook-payload.types';
import {
  isSupportedSchemaVersion,
  resolveSchemaVersion,
  WebhookSchemaVersion,
} from './webhook-schema-version';
import { buildTransactionCompletedV1 } from './transaction-completed.v1';
import { buildTransactionCompletedV2 } from './transaction-completed.v2';

type VersionedBuilders = Partial<
  Record<WebhookSchemaVersion, WebhookPayloadBuilder>
>;

/**
 * Events with no registered builder are dropped rather than delivered with
 * their raw payload. This is an allowlist: only events explicitly registered
 * below are ever sent to customer endpoints, so a newly added event cannot
 * leak PII or internal fields by default.
 */
const dropUnregistered: WebhookPayloadBuilder = () => ({});

/**
 * Curated builders for KYC lifecycle events. Only non-sensitive identifiers,
 * status and timestamps are emitted — document numbers, dates of birth,
 * storage keys and reviewer ids are never forwarded.
 */
const buildKycApprovedV1: WebhookPayloadBuilder = (data) => {
  const kyc = (data ?? {}) as Record<string, unknown>;
  return {
    id: kyc.id,
    userId: kyc.userId,
    status: kyc.status,
    reviewedAt: kyc.reviewedAt,
    updatedAt: kyc.updatedAt,
  };
};

const buildKycRejectedV1: WebhookPayloadBuilder = (data) => {
  const kyc = (data ?? {}) as Record<string, unknown>;
  return {
    id: kyc.id,
    userId: kyc.userId,
    status: kyc.status,
    reason: kyc.rejectionReason ?? kyc.reason,
    reviewedAt: kyc.reviewedAt,
    updatedAt: kyc.updatedAt,
  };
};

const buildKycResubmissionRequiredV1: WebhookPayloadBuilder = (data) => {
  const kyc = (data ?? {}) as Record<string, unknown>;
  return {
    id: kyc.id,
    userId: kyc.userId,
    status: kyc.status,
    reason: kyc.resubmissionReason ?? kyc.reason,
    updatedAt: kyc.updatedAt,
  };
};

/**
 * Curated builder for referral rewards. Only the referral id, referrer id,
 * status and timestamps are emitted; the raw referral entity is never sent.
 */
const buildReferralRewardedV1: WebhookPayloadBuilder = (data) => {
  const referral = (data ?? {}) as Record<string, unknown>;
  return {
    id: referral.id,
    referrerId: referral.referrerId,
    refereeId: referral.refereeId,
    status: referral.status,
    rewardAmount: referral.rewardAmount,
    rewardedAt: referral.rewardedAt,
    updatedAt: referral.updatedAt,
  };
};

/**
 * Curated builder for rate alerts. Only the alert id, pair, threshold and
 * timestamps are emitted.
 */
const buildRateAlertTriggeredV1: WebhookPayloadBuilder = (data) => {
  const alert = (data ?? {}) as Record<string, unknown>;
  return {
    id: alert.id,
    userId: alert.userId,
    pair: alert.pair,
    direction: alert.direction,
    threshold: alert.threshold,
    rate: alert.rate,
    triggeredAt: alert.triggeredAt,
  };
};

const SCHEMA_REGISTRY: Record<string, VersionedBuilders> = {
  'transaction.completed': {
    '1.0': buildTransactionCompletedV1,
    '2.0': buildTransactionCompletedV2,
  },
  // Identical payload shape to transaction.completed, so it shares the builders.
  'transaction.failed': {
    '1.0': buildTransactionCompletedV1,
    '2.0': buildTransactionCompletedV2,
  },
  'kyc.approved': {
    '1.0': buildKycApprovedV1,
    '2.0': buildKycApprovedV1,
  },
  'kyc.rejected': {
    '1.0': buildKycRejectedV1,
    '2.0': buildKycRejectedV1,
  },
  'kyc.resubmission_required': {
    '1.0': buildKycResubmissionRequiredV1,
    '2.0': buildKycResubmissionRequiredV1,
  },
  'referral.rewarded': {
    '1.0': buildReferralRewardedV1,
    '2.0': buildReferralRewardedV1,
  },
  'rate_alert.triggered': {
    '1.0': buildRateAlertTriggeredV1,
    '2.0': buildRateAlertTriggeredV1,
  },
};

export class WebhookSchemaTransformer {
  /**
   * Shape an event into the envelope for a specific schema version.
   *
   * `version` is a plain string rather than WebhookSchemaVersion because it
   * usually arrives from the database; unsupported values resolve to the latest
   * version rather than failing the delivery.
   *
   * Events without a registered builder are dropped (empty data) so raw
   * entities can never leak to customer endpoints by default.
   */
  static transform<TData = unknown>(
    event: string,
    data: unknown,
    version: string | null | undefined,
    options: WebhookEnvelopeOptions = {},
  ): WebhookEnvelope<TData> {
    const schemaVersion = resolveSchemaVersion(version);
    const build = SCHEMA_REGISTRY[event]?.[schemaVersion] ?? dropUnregistered;

    return {
      id: options.id ?? crypto.randomUUID(),
      event,
      schemaVersion,
      data: build(data) as TData,
      timestamp: options.timestamp ?? new Date().toISOString(),
    };
  }

  static isSupportedVersion(value: unknown): value is WebhookSchemaVersion {
    return isSupportedSchemaVersion(value);
  }

  static resolveVersion(value: unknown): WebhookSchemaVersion {
    return resolveSchemaVersion(value);
  }

  /** True when the event has version-specific builders rather than pass-through. */
  static hasVersionedSchema(event: string): boolean {
    return SCHEMA_REGISTRY[event] !== undefined;
  }

  static registeredEvents(): string[] {
    return Object.keys(SCHEMA_REGISTRY);
  }
}
