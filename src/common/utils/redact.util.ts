const SENSITIVE_KEYS = new Set([
  'password',
  'newpassword',
  'oldpassword',
  'currentpassword',
  'otp',
  'totpcode',
  'backupcode',
  'refreshtoken',
  'twofactortoken',
  'accesstoken',
  'token',
  'secret',
  'secretkey',
  'walletsecretkeyencrypted',
  'authorization',
  'twofactorsecret',
  'signature',
  'pin',
  'cardnumber',
  'cvv',
]);

const REDACTED = '[REDACTED]';

export const isSensitiveKey = (key: string): boolean =>
  SENSITIVE_KEYS.has(key.replace(/[-_\s]/g, '').toLowerCase());

/**
 * Returns a copy of the value with every sensitive field replaced.
 *
 * Nested objects and arrays are walked so a secret inside `profile` or
 * `metadata` does not survive. Cycles are tolerated: a repeated reference
 * becomes '[Circular]' rather than blowing up the request.
 */
export function redact<T>(value: T, seen = new WeakSet<object>()): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => redact(entry, seen));
  }

  if (value && typeof value === 'object') {
    if (value instanceof Date || Buffer.isBuffer(value)) {
      return value;
    }
    if (seen.has(value as object)) {
      return '[Circular]';
    }
    seen.add(value as object);

    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      result[key] = isSensitiveKey(key) ? REDACTED : redact(entry, seen);
    }
    return result;
  }

  return value;
}
