import { randomUUID } from 'crypto';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

/**
 * Returns the client-supplied X-Request-ID when it is safe to echo, otherwise
 * a fresh UUID.
 *
 * The header was interpolated into log lines verbatim, so a newline or other
 * control character let a client forge extra log entries.
 */
export function sanitizeRequestId(value: unknown): string {
  if (typeof value !== 'string') {
    return randomUUID();
  }

  const trimmed = value.trim();
  return REQUEST_ID_PATTERN.test(trimmed) ? trimmed : randomUUID();
}
