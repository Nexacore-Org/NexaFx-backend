import { WebhookSchemaVersion } from './webhook-schema-version';

/**
 * The envelope wrapping every webhook delivery. Stable across schema versions —
 * only `data` changes shape between versions.
 */
export interface WebhookEnvelope<TData = unknown> {
  /** Event id, stable across every endpoint that receives this event. */
  id: string;
  event: string;
  schemaVersion: WebhookSchemaVersion;
  data: TData;
  /** ISO 8601 timestamp of when the event was dispatched. */
  timestamp: string;
}

/**
 * Lets the dispatcher reuse one id/timestamp across the fan-out so the same
 * event is correlatable even when endpoints receive different payload shapes.
 */
export interface WebhookEnvelopeOptions {
  id?: string;
  timestamp?: string;
}

/** Shapes an event's raw source data into one version's `data` payload. */
export type WebhookPayloadBuilder<TIn = any, TOut = unknown> = (
  data: TIn,
) => TOut;
