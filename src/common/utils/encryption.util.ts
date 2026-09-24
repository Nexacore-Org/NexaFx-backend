import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

export function getWalletEncryptionKey(keyHex: string): Buffer {
  if (!keyHex) {
    throw new Error('WALLET_ENCRYPTION_KEY environment variable is not set');
  }

  if (keyHex.length !== 64) {
    throw new Error(
      'WALLET_ENCRYPTION_KEY must be a 64-character hex string (256 bits)',
    );
  }

  return Buffer.from(keyHex, 'hex');
}

/** Encrypts plaintext with AES-256-GCM; returns base64(IV + AuthTag + Ciphertext). */
export function encryptWithAes256Gcm(
  plaintext: string,
  keyHex: string,
): string {
  const key = getWalletEncryptionKey(keyHex);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, authTag, encrypted]);

  return combined.toString('base64');
}

/** Decrypts data produced by encryptWithAes256Gcm. */
export function decryptWithAes256Gcm(
  encryptedData: string,
  keyHex: string,
): string {
  const key = getWalletEncryptionKey(keyHex);
  const combined = Buffer.from(encryptedData, 'base64');

  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}
