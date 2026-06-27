import { decryptWithAes256Gcm, encryptWithAes256Gcm } from './encryption.util';

const TEST_KEY =
  '0000000000000000000000000000000000000000000000000000000000000000';

describe('encryption.util', () => {
  it('round-trips AES-256-GCM encryption', () => {
    const plaintext = 'SABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
    const encrypted = encryptWithAes256Gcm(plaintext, TEST_KEY);
    const decrypted = decryptWithAes256Gcm(encrypted, TEST_KEY);

    expect(decrypted).toBe(plaintext);
    expect(encrypted).not.toContain(plaintext);
  });
});
