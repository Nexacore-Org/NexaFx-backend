import { MockOcrProvider } from './mock-ocr.provider';

describe('MockOcrProvider', () => {
  it('returns fixed fixture fields without calling external APIs', async () => {
    const provider = new MockOcrProvider();
    const result = await provider.extract('any-key');

    expect(result.fullName).toBe('Jane Doe');
    expect(result.documentNumber).toBe('AB123456');
    expect(result.dateOfBirth).toBe('1990-01-01');
    expect(result.expiryDate).toBe('2030-01-01');
    expect(result.nationality).toBe('NG');
    expect(result.confidence).toBe(92);
  });
});
