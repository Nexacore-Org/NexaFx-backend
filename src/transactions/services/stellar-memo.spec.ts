import { StellarService } from '../../modules/stellar/stellar.service';
import {
  buildStellarMemo,
  truncateMemoTo28Bytes,
} from './transaction.service';

describe('Stellar transaction memos', () => {
  it('keeps withdrawal and swap default memos within 28 UTF-8 bytes', () => {
    const transactionId = '3f4c0a1e-7b62-4d95-9a08-0e1c2d3f4a5b';

    for (const prefix of ['W', 'S'] as const) {
      const memo = buildStellarMemo(prefix, transactionId);
      expect(memo.startsWith(`${prefix}-`)).toBe(true);
      expect(Buffer.byteLength(memo, 'utf8')).toBeLessThanOrEqual(28);
    }
  });

  it('truncates a long user-supplied memo to 28 bytes', () => {
    const memo = truncateMemoTo28Bytes(`=${'a'.repeat(100)}`);

    expect(Buffer.byteLength(memo, 'utf8')).toBeLessThanOrEqual(28);
    expect(memo).not.toContain('\uFFFD');
  });

  it('normalizes memos before passing them to Memo.text', () => {
    const normalizeMemo = (StellarService.prototype as any).normalizeMemo;

    expect(typeof normalizeMemo).toBe('function');
    expect(normalizeMemo(undefined)).toBeUndefined();
    expect(Buffer.byteLength(normalizeMemo('é'.repeat(40)), 'utf8')).toBeLessThanOrEqual(28);
  });
});
