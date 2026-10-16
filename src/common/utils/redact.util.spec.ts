import { isSensitiveKey, redact } from './redact.util';

describe('redact', () => {
  it('replaces a password with [REDACTED]', () => {
    expect(redact({ email: 'a@b.c', password: 'hunter2' })).toEqual({
      email: 'a@b.c',
      password: '[REDACTED]',
    });
  });

  it.each([
    'password',
    'newPassword',
    'oldPassword',
    'currentPassword',
    'otp',
    'totpCode',
    'backupCode',
    'refreshToken',
    'twoFactorToken',
    'accessToken',
    'token',
    'secret',
    'authorization',
    'signature',
  ])('redacts %s', (key) => {
    const result = redact({ [key]: 'sensitive' }) as Record<string, string>;
    expect(result[key]).toBe('[REDACTED]');
  });

  it('matches keys regardless of case, dashes, underscores or spaces', () => {
    expect(isSensitiveKey('New_Password')).toBe(true);
    expect(isSensitiveKey('refresh-token')).toBe(true);
    expect(isSensitiveKey('TWO FACTOR TOKEN')).toBe(true);
    expect(isSensitiveKey('email')).toBe(false);
  });

  it('walks nested objects', () => {
    const result = redact({
      user: { email: 'a@b.c', totpCode: '123456' },
      metadata: [{ password: 'x' }],
    });

    expect(result).toEqual({
      user: { email: 'a@b.c', totpCode: '[REDACTED]' },
      metadata: [{ password: '[REDACTED]' }],
    });
  });

  it('tolerates circular references', () => {
    const body: Record<string, unknown> = { email: 'a@b.c' };
    body.self = body;

    const result = redact(body) as Record<string, unknown>;

    expect(result.email).toBe('a@b.c');
    expect(result.self).toBe('[Circular]');
  });

  it('leaves primitives and dates alone', () => {
    const date = new Date('2026-01-01T00:00:00Z');
    expect(redact({ count: 3, flag: true, date })).toEqual({
      count: 3,
      flag: true,
      date,
    });
  });

  it('does not mutate the input', () => {
    const body = { password: 'hunter2' };
    redact(body);
    expect(body.password).toBe('hunter2');
  });
});
