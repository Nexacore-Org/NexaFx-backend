import { WebhookPayloadBuilder } from './webhook-payload.types';

/**
 * `transaction.completed` / `transaction.failed` — schema v1.0. FROZEN.
 *
 * v1 serialises the Transaction entity verbatim: every column the entity carries
 * lands on the wire, Postgres numerics arrive as strings, and enums keep their
 * uppercase database casing.
 *
 * Do not change this shape. Consumers still pinned to 1.0 depend on it field for
 * field — additions, removals and renames all belong in a new version. See
 * transaction-completed.v2.ts for the curated replacement.
 */
export interface TransactionCompletedV1Data {
  id: string;
  userId: string;
  /** Uppercase enum, e.g. 'SWAP'. */
  type: string;
  /** Uppercase enum, e.g. 'SUCCESS'. */
  status: string;
  /** Postgres numeric, serialised as a string — e.g. '150.00000000'. */
  amount: string;
  currency: string;
  rate?: string | null;
  feeAmount?: string | null;
  feeCurrency?: string | null;
  toCurrency?: string | null;
  toAmount?: string | null;
  txHash?: string | null;
  reference?: string | null;
  counterpartyMemo?: string | null;
  failureReason?: string | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  /** v1 emitted every remaining entity column, internal ones included. */
  [key: string]: unknown;
}

/**
 * Sensitive columns that must never leave the process, even though v1 is a
 * frozen pass-through of the entity. These are credential/secret material on
 * the User relation (and any other entity that may be attached).
 */
const SENSITIVE_KEYS = new Set<string>([
  'password',
  'passwordHash',
  'walletSecretKeyEncrypted',
  'walletSecretKey',
  'twoFactorSecret',
  'twoFactorRecoveryCodes',
  'refreshToken',
  'refreshTokenHash',
  'phone',
  'balances',
]);

/**
 * Relation keys that carry nested entities. v1 only ever promised scalar
 * columns, so object-valued relations are dropped rather than serialised.
 */
const RELATION_KEYS = new Set<string>([
  'user',
  'category',
  'wallet',
  'transaction',
  'counterparty',
  'recipient',
  'sender',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
}

export const buildTransactionCompletedV1: WebhookPayloadBuilder<
  unknown,
  TransactionCompletedV1Data
> = (data) => {
  const source = (data ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(source)) {
    if (SENSITIVE_KEYS.has(key)) continue;
    if (RELATION_KEYS.has(key)) continue;
    // Drop any other object-valued relation (nested entity) that slipped in.
    if (isPlainObject(value)) continue;
    out[key] = value;
  }

  return out as unknown as TransactionCompletedV1Data;
};
