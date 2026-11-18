import { sanitizeRequestId } from './request-id.util';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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
    expect(result).toMatch(UUID_PATTERN);
  });

  it.each([
    'req 1',
    'req;1',
    'req<script>',
    'a'.repeat(65),
    '',
  ])('replaces %j with a UUID', (value) => {
    expect(sanitizeRequestId(value)).toMatch(UUID_PATTERN);
  });

  it.each([undefined, null, 42, {}, ['a']])(
    'replaces a non-string value (%j)',
    (value) => {
      expect(sanitizeRequestId(value)).toMatch(UUID_PATTERN);
    },
  );
});
