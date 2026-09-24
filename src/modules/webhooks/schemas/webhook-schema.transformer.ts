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
 * Events with no registered builder are delivered with `data` untouched on every
 * version — their shape has never changed, so there is nothing to transform.
 */
const passThrough: WebhookPayloadBuilder = (data) => data;

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
};

export class WebhookSchemaTransformer {
  /**
   * Shape an event into the envelope for a specific schema version.
   *
   * `version` is a plain string rather than WebhookSchemaVersion because it
   * usually arrives from the database; unsupported values resolve to the latest
   * version rather than failing the delivery.
   */
  static transform<TData = unknown>(
    event: string,
    data: unknown,
    version: string | null | undefined,
    options: WebhookEnvelopeOptions = {},
  ): WebhookEnvelope<TData> {
    const schemaVersion = resolveSchemaVersion(version);
    const build = SCHEMA_REGISTRY[event]?.[schemaVersion] ?? passThrough;

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
