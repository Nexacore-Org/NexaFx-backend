import {
  escapeCsvField,
  FORMULA_PREFIXES,
  sanitizeCsvCell,
  sanitizeSpreadsheetCell,
  toCsvRow,
} from './csv.util';

describe('csv.util', () => {
  describe('sanitizeSpreadsheetCell / sanitizeCsvCell', () => {
    it.each(['=', '+', '-', '@', '\t', '\r'])(
      'prefixes a leading single quote when a cell starts with %p',
      (prefix) => {
        const malicious = `${prefix}HYPERLINK("http://evil.example","click")`;
        expect(sanitizeSpreadsheetCell(malicious)).toBe(`'${malicious}`);
        expect(sanitizeCsvCell(malicious)).toBe(`'${malicious}`);
      },
    );

    it('neutralizes =HYPERLINK(...) as "\'=HYPERLINK(...)"', () => {
      expect(sanitizeSpreadsheetCell('=HYPERLINK(...)')).toBe(
        "'=HYPERLINK(...)",
      );
    });

    it('neutralizes formula prefixes preceded by leading spaces', () => {
      expect(sanitizeSpreadsheetCell('  =SUM(A1:A2)')).toBe("'  =SUM(A1:A2)");
      expect(sanitizeSpreadsheetCell('   @cmd')).toBe("'   @cmd");
    });

    it('leaves safe strings and non-string values unchanged', () => {
      expect(sanitizeSpreadsheetCell('Uncategorized')).toBe('Uncategorized');
      expect(sanitizeSpreadsheetCell('')).toBe('');
      expect(sanitizeSpreadsheetCell(42)).toBe(42);
      expect(sanitizeSpreadsheetCell(null)).toBeNull();
      expect(sanitizeSpreadsheetCell(undefined)).toBeUndefined();
    });

    it('exposes all six spreadsheet formula prefixes', () => {
      expect(FORMULA_PREFIXES).toEqual(['=', '+', '-', '@', '\t', '\r']);
    });
  });

  describe('escapeCsvField', () => {
    it.each([
      ['=HYPERLINK(...)', `"'=HYPERLINK(...)"`],
      ["+cmd|' /C calc'!A0", `"'+cmd|' /C calc'!A0"`],
      ['-2+3', `"'-2+3"`],
      ["@SUM(1+1)*cmd|' /C calc'!A0", `"'@SUM(1+1)*cmd|' /C calc'!A0"`],
      ['\t=1+1', `"'\t=1+1"`],
      ['\r=1+1', `"'\r=1+1"`],
    ])('neutralizes and quotes %p -> %p', (input, expected) => {
      expect(escapeCsvField(input)).toBe(expected);
    });

    it('escapes embedded double quotes and preserves commas and newlines', () => {
      expect(escapeCsvField('say "hello", world')).toBe(
        '"say ""hello"", world"',
      );
      expect(escapeCsvField('line1\nline2\r\nline3')).toBe(
        '"line1\nline2\r\nline3"',
      );
    });

    it('handles null, undefined, numbers, booleans, and Dates', () => {
      expect(escapeCsvField(null)).toBe('""');
      expect(escapeCsvField(undefined)).toBe('""');
      expect(escapeCsvField(100)).toBe('"100"');
      expect(escapeCsvField(true)).toBe('"true"');
      expect(escapeCsvField(new Date('2026-01-01T00:00:00.000Z'))).toBe(
        '"2026-01-01T00:00:00.000Z"',
      );
    });
  });

  describe('toCsvRow', () => {
    it('joins escaped fields with commas', () => {
      const row = toCsvRow([
        'id-1',
        '=HYPERLINK("http://evil.example","x")',
        'Note with "quotes"\nand newline',
      ]);
      expect(row).toBe(
        '"id-1","\'=HYPERLINK(""http://evil.example"",""x"")","Note with ""quotes""\nand newline"',
      );
    });
  });
});
