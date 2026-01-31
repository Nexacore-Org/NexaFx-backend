import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class EncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly ivLength = 16;
  private readonly authTagLength = 16;

  constructor(private readonly configService: ConfigService) {}

  /**
   * Encrypts sensitive data using AES-256-GCM
   * @param plaintext - The data to encrypt
   * @returns base64(IV + AuthTag + Ciphertext)
   */
  encrypt(plaintext: string): string {
    const key = this.getEncryptionKey();
    const iv = crypto.randomBytes(this.ivLength);

    const cipher = crypto.createCipheriv(this.algorithm, key, iv, {
      authTagLength: this.authTagLength,
    });

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    // Combine IV + AuthTag + Ciphertext
    const combined = Buffer.concat([iv, authTag, encrypted]);

    return combined.toString('base64');
  }

  /**
   * Decrypts data encrypted with encrypt()
   * @param encryptedData - base64(IV + AuthTag + Ciphertext)
   * @returns The decrypted plaintext
   */
  decrypt(encryptedData: string): string {
    const key = this.getEncryptionKey();
    const combined = Buffer.from(encryptedData, 'base64');

    // Extract IV, AuthTag, and Ciphertext
    const iv = combined.subarray(0, this.ivLength);
    const authTag = combined.subarray(
      this.ivLength,
      this.ivLength + this.authTagLength,
    );
    const ciphertext = combined.subarray(this.ivLength + this.authTagLength);

    const decipher = crypto.createDecipheriv(this.algorithm, key, iv, {
      authTagLength: this.authTagLength,
    });

    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }

  private getEncryptionKey(): Buffer {
    const keyHex = this.configService.get<string>('WALLET_ENCRYPTION_KEY');

    if (!keyHex) {
      throw new Error('WALLET_ENCRYPTION_KEY environment variable is not set');
    }

    // Expect a 64-character hex string (32 bytes = 256 bits)
    if (keyHex.length !== 64) {
      throw new Error(
        'WALLET_ENCRYPTION_KEY must be a 64-character hex string (256 bits)',
      );
    }

    return Buffer.from(keyHex, 'hex');
  }
}
