/**
 * Webhook payload schema versioning.
 *
 * Every envelope NexaFX delivers carries a `schemaVersion`. A breaking change to
 * a payload's shape introduces a NEW version — an already-published version's
 * shape is never modified. At least two versions stay deliverable at all times,
 * and a version remains deliverable for at least DEPRECATION_WINDOW_DAYS after
 * it is marked deprecated.
 *
 * Consumer-facing migration guide: docs/webhook-schema-versions.md
 */

export const WEBHOOK_SCHEMA_VERSIONS = ['1.0', '2.0'] as const;

export type WebhookSchemaVersion = (typeof WEBHOOK_SCHEMA_VERSIONS)[number];

export const LATEST_WEBHOOK_SCHEMA_VERSION: WebhookSchemaVersion = '2.0';

/**
 * Applied to endpoints created from now on. Endpoints that existed before
 * versioning shipped are backfilled to '1.0' by the migration so their payload
 * shape does not change underneath them.
 */
export const DEFAULT_WEBHOOK_SCHEMA_VERSION = LATEST_WEBHOOK_SCHEMA_VERSION;

/** Minimum time a deprecated version stays deliverable before sunset. */
export const DEPRECATION_WINDOW_DAYS = 90;

export const SCHEMA_VERSIONS_DOC_URL =
  'https://docs.nexafx.com/webhooks/schema-versions';

export interface WebhookSchemaVersionInfo {
  version: WebhookSchemaVersion;
  /** ISO date the version became deliverable. */
  effectiveFrom: string;
  /** ISO date the version was marked deprecated, or null while current. */
  deprecatedOn: string | null;
  /**
   * ISO date deliveries on this version stop, or null while current.
   * Always at least DEPRECATION_WINDOW_DAYS after `deprecatedOn`.
   */
  sunsetOn: string | null;
}

export const WEBHOOK_SCHEMA_VERSION_REGISTRY: Record<
  WebhookSchemaVersion,
  WebhookSchemaVersionInfo
> = {
  '1.0': {
    version: '1.0',
    effectiveFrom: '2025-01-15',
    deprecatedOn: '2026-07-29',
    sunsetOn: '2026-10-27', // deprecatedOn + 90 days
  },
  '2.0': {
    version: '2.0',
    effectiveFrom: '2026-07-29',
    deprecatedOn: null,
    sunsetOn: null,
  },
};

export function isSupportedSchemaVersion(
  value: unknown,
): value is WebhookSchemaVersion {
  return (
    typeof value === 'string' &&
    (WEBHOOK_SCHEMA_VERSIONS as readonly string[]).includes(value)
  );
}

/**
 * Coerce a stored/user-supplied value to a deliverable version.
 *
 * Delivery must never fail because a row holds an unrecognised value, so
 * anything unsupported resolves to the latest version. API input is validated
 * up front by UpdateWebhookEndpointDto.
 */
export function resolveSchemaVersion(value: unknown): WebhookSchemaVersion {
  return isSupportedSchemaVersion(value)
    ? value
    : LATEST_WEBHOOK_SCHEMA_VERSION;
}

export function getSchemaVersionInfo(
  version: WebhookSchemaVersion,
): WebhookSchemaVersionInfo {
  return WEBHOOK_SCHEMA_VERSION_REGISTRY[version];
}

export function isDeprecatedSchemaVersion(version: unknown): boolean {
  return (
    isSupportedSchemaVersion(version) &&
    WEBHOOK_SCHEMA_VERSION_REGISTRY[version].deprecatedOn !== null
  );
}

/**
 * Headers advertising the schema version a delivery was shaped for.
 *
 * Deprecated versions additionally get the RFC 8594 `Deprecation`/`Sunset`
 * pair, a `Link` to the migration guide, and the NexaFX-specific
 * `X-NexaFX-Schema-Deprecated` flag.
 */
export function buildSchemaHeaders(
  version: WebhookSchemaVersion,
): Record<string, string> {
  const headers: Record<string, string> = {
    'X-NexaFX-Schema-Version': version,
  };

  const info = WEBHOOK_SCHEMA_VERSION_REGISTRY[version];
  if (!info?.deprecatedOn) return headers;

  headers['X-NexaFX-Schema-Deprecated'] = 'true';
  headers['Deprecation'] = 'true';
  headers['Link'] =
    `<${SCHEMA_VERSIONS_DOC_URL}>; rel="deprecation"; type="text/html"`;

  if (info.sunsetOn) {
    // RFC 8594 requires an HTTP-date, not an ISO-8601 date.
    headers['Sunset'] = new Date(`${info.sunsetOn}T00:00:00.000Z`).toUTCString();
  }

  return headers;
}
