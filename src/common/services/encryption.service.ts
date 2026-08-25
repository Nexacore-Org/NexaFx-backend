import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  decryptWithAes256Gcm,
  encryptWithAes256Gcm,
} from '../utils/encryption.util';

@Injectable()
export class EncryptionService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Encrypts sensitive data using AES-256-GCM
   * @param plaintext - The data to encrypt
   * @returns base64(IV + AuthTag + Ciphertext)
   */
  encrypt(plaintext: string): string {
    return encryptWithAes256Gcm(plaintext, this.getEncryptionKeyHex());
  }

  /**
   * Decrypts data encrypted with encrypt()
   * @param encryptedData - base64(IV + AuthTag + Ciphertext)
   * @returns The decrypted plaintext
   */
  decrypt(encryptedData: string): string {
    return decryptWithAes256Gcm(encryptedData, this.getEncryptionKeyHex());
  }

  private getEncryptionKeyHex(): string {
    const keyHex = this.configService.get<string>('WALLET_ENCRYPTION_KEY');

    if (!keyHex) {
      throw new Error('WALLET_ENCRYPTION_KEY environment variable is not set');
    }

    return keyHex;
  }
}
