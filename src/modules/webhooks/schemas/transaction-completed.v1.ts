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

export const buildTransactionCompletedV1: WebhookPayloadBuilder<
  unknown,
  TransactionCompletedV1Data
> = (data) =>
  // Shallow copy only. v1 is a frozen pass-through of the entity, but the stored
  // delivery payload must not alias the caller's object.
  ({
    ...((data ?? {}) as Record<string, unknown>),
  }) as unknown as TransactionCompletedV1Data;
