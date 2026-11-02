/**
 * CSV escaping and formula-injection sanitization shared across exports
 * (analytics, custom reports, receipts, compliance, and admin reporting).
 *
 * Free-text fields (category names, counterparty memos, user emails/names,
 * SAR narratives, rule names, …) contain commas, quotes and newlines that
 * would break row/column alignment, and a value beginning with `=`, `+`, `-`,
 * `@`, tab (`\t`), or carriage return (`\r`) is executed as a formula by
 * spreadsheet software, so it is prefixed with a single quote (`'`).
 */

/** Characters a spreadsheet treats as the start of a formula or command. */
export const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r'] as const;

/**
 * Neutralizes spreadsheet formula injection on a single cell value by
 * prefixing a single quote (`'`) when the string (or its leading-space-trimmed
 * form) starts with `=`, `+`, `-`, `@`, `\t`, or `\r`.
 */
export function sanitizeSpreadsheetCell<T>(value: T): T | string {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trimStart();
  if (
    FORMULA_PREFIXES.some(
      (char) => value.startsWith(char) || trimmed.startsWith(char),
    )
  ) {
    return `'${value}`;
  }

  return value;
}

/** Alias of `sanitizeSpreadsheetCell` for CSV-specific callers. */
export const sanitizeCsvCell = sanitizeSpreadsheetCell;

/** Quotes one CSV field, always, so embedded separators cannot shift a column. */
export function escapeCsvField(value: unknown): string {
  const raw =
    value === null || value === undefined
      ? ''
      : value instanceof Date
        ? value.toISOString()
        : String(value);
  const neutralised = sanitizeSpreadsheetCell(raw);
  return `"${neutralised.replace(/"/g, '""')}"`;
}

/** Joins fields into one escaped CSV row. */
export function toCsvRow(values: readonly unknown[]): string {
  return values.map(escapeCsvField).join(',');
}
