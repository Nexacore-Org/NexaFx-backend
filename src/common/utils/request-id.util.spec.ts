import { randomUUID } from 'crypto';
import { sanitizeRequestId } from './request-id.util';

describe('sanitizeRequestId', () => {
  it('keeps a well-formed id', () => {
    expect(sanitizeRequestId('req-123_ABC')).toBe('req-123_ABC');
  });

  it('trims surrounding whitespace', () => {
    expect(sanitizeRequestId('  req-1  ')).toBe('req-1');
  });

  it('replaces an id containing a newline', () => {
    const result = sanitizeRequestId('req-1\n[INFO] forged log line');

    expect(result).not.toContain('\n');
    expect(result).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it.each([
    'req 1',
    'req;1',
    'req<script>',
    'a'.repeat(65),
    '',
  ])('replaces %j with a UUID', (value) => {
    const result = sanitizeRequestId(value);

    if (value.trim() === '') {
      expect(result).not.toBe('');
    } else {
      expect(result).toBe(randomUUID());
    }
  });

  it.each([undefined, null, 42, {}, ['a']])(
    'replaces a non-string value (%j)',
    (value) => {
      expect(sanitizeRequestId(value)).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    },
  );
});
