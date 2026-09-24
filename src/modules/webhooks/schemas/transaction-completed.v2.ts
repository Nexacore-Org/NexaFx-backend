import { WebhookPayloadBuilder } from './webhook-payload.types';

/**
 * `transaction.completed` / `transaction.failed` — schema v2.0 (current).
 *
 * Breaking changes from v1.0:
 *  - `id` renamed to `transactionId` (v1's `id` collided with the envelope id).
 *  - Decimal fields are JSON numbers, no longer numeric-as-string.
 *  - `feeAmount`/`feeCurrency` collapsed into a nested `fee` object, null when
 *    no fee was charged.
 *  - `rate`/`toCurrency`/`toAmount` collapsed into a nested `conversion` object,
 *    null for non-converting transactions.
 *  - `txHash` renamed to `stellarTxHash`.
 *  - `counterpartyMemo` renamed to `memo`.
 *  - `type`/`status` are lowercase.
 *  - Internal and private columns are no longer emitted — notably `userNote`,
 *    the transaction owner's private note, which v1 leaked to every subscriber.
 */

export interface TransactionCompletedV2Fee {
  amount: number;
  currency: string | null;
}

export interface TransactionCompletedV2Conversion {
  fromCurrency: string | null;
  toCurrency: string;
  toAmount: number | null;
  rate: number | null;
}

export interface TransactionCompletedV2Data {
  transactionId: string | null;
  userId: string | null;
  /** Lowercase, e.g. 'swap'. */
  type: string | null;
  /** Lowercase, e.g. 'success'. */
  status: string | null;
  amount: number | null;
  currency: string | null;
  fee: TransactionCompletedV2Fee | null;
  conversion: TransactionCompletedV2Conversion | null;
  memo: string | null;
  reference: string | null;
  stellarTxHash: string | null;
  failureReason: string | null;
  /** ISO 8601. */
  createdAt: string | null;
  /** ISO 8601. */
  updatedAt: string | null;
}

/**
 * The transaction record as it reaches the builder — a TypeORM entity, a partial
 * of one, or a plain object from a replayed delivery. Every field is `unknown` so
 * the coercion helpers below are the only way to read one.
 */
interface TransactionSource {
  id?: unknown;
  userId?: unknown;
  type?: unknown;
  status?: unknown;
  amount?: unknown;
  currency?: unknown;
  rate?: unknown;
  feeAmount?: unknown;
  feeCurrency?: unknown;
  toCurrency?: unknown;
  toAmount?: unknown;
  txHash?: unknown;
  stellarTxHash?: unknown;
  reference?: unknown;
  counterpartyMemo?: unknown;
  failureReason?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toIsoString(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toLowerCase(value: unknown): string | null {
  return typeof value === 'string' ? value.toLowerCase() : null;
}

function toText(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export const buildTransactionCompletedV2: WebhookPayloadBuilder<
  unknown,
  TransactionCompletedV2Data
> = (data) => {
  const tx = (data ?? {}) as TransactionSource;

  const feeAmount = toNumber(tx.feeAmount);
  const currency = toText(tx.currency);
  const toCurrency = toText(tx.toCurrency);

  return {
    transactionId: toText(tx.id),
    userId: toText(tx.userId),
    type: toLowerCase(tx.type),
    status: toLowerCase(tx.status),
    amount: toNumber(tx.amount),
    currency,
    fee:
      feeAmount === null
        ? null
        : { amount: feeAmount, currency: toText(tx.feeCurrency) ?? currency },
    conversion: toCurrency
      ? {
          fromCurrency: currency,
          toCurrency,
          toAmount: toNumber(tx.toAmount),
          rate: toNumber(tx.rate),
        }
      : null,
    memo: toText(tx.counterpartyMemo),
    reference: toText(tx.reference),
    stellarTxHash: toText(tx.stellarTxHash) ?? toText(tx.txHash),
    failureReason: toText(tx.failureReason),
    createdAt: toIsoString(tx.createdAt),
    updatedAt: toIsoString(tx.updatedAt),
  };
};
