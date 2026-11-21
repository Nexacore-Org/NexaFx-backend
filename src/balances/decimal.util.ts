import Decimal from 'decimal.js';

/**
 * Convert a money value to an exact Decimal.
 *
 * Numbers go through their shortest string form (never through binary
 * float arithmetic) and non-finite values are rejected, so a NaN or
 * Infinity can never reach a balance column.
 */
export function toDecimal(value: Decimal.Value): Decimal {
  const decimal = new Decimal(
    typeof value === 'number' ? value.toString() : value,
  );
  if (!decimal.isFinite()) {
    throw new RangeError('Monetary value must be a finite number');
  }
  return decimal;
}
