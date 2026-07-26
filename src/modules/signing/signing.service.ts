import { Injectable, BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as speakeasy from 'speakeasy';
import * as crypto from 'crypto';
import { TransactionSigningKey } from './entities/transaction-signing-key.entity';

const ENCRYPTION_KEY = process.env.TOTP_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const ALGORITHM = 'aes-256-gcm';

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function decrypt(encryptedText: string): string {
  const [ivHex, authTagHex, encrypted] = encryptedText.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

@Injectable()
export class SigningService {
  constructor(
    @InjectRepository(TransactionSigningKey)
    private readonly keyRepo: Repository<TransactionSigningKey>,
  ) {}

  async setupKey(
    userId: string,
    keyName: string,
    minAmountUsd: string,
  ): Promise<{ secret: string; keyId: string }> {
    const secret = speakeasy.generateSecret({
      name: `NexaFX:${keyName}`,
      length: 20,
    });

    const encryptedSecret = encrypt(secret.base32);

    const key = this.keyRepo.create({
      userId,
      keyName,
      totpSecret: encryptedSecret,
      isActive: false,
      minAmountUsd: minAmountUsd || '0',
    });

    const saved = await this.keyRepo.save(key);
    return { secret: secret.base32, keyId: saved.id };
  }

  async confirmSetup(keyId: string, totpCode: string): Promise<TransactionSigningKey> {
    const key = await this.keyRepo.findOne({ where: { id: keyId } });
    if (!key) {
      throw new NotFoundException('Signing key not found');
    }
    if (key.isActive) {
      throw new BadRequestException('Key is already active');
    }

    const decryptedSecret = decrypt(key.totpSecret);
    const verified = speakeasy.totp.verify({
      secret: decryptedSecret,
      encoding: 'base32',
      token: totpCode,
      window: 1,
    });

    if (!verified) {
      throw new UnauthorizedException('Invalid TOTP code');
    }

    key.isActive = true;
    key.activatedAt = new Date();
    return this.keyRepo.save(key);
  }

  async listKeys(userId: string): Promise<any[]> {
    const keys = await this.keyRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    return keys.map((key) => ({
      id: key.id,
      keyName: key.keyName,
      isActive: key.isActive,
      activatedAt: key.activatedAt,
      lastUsedAt: key.lastUsedAt,
      minAmountUsd: key.minAmountUsd,
      totpSecret: key.totpSecret.substring(0, 4) + '****',
      createdAt: key.createdAt,
    }));
  }

  async revokeKey(keyId: string, userId: string, totpCode: string): Promise<void> {
    const key = await this.keyRepo.findOne({ where: { id: keyId, userId } });
    if (!key) {
      throw new NotFoundException('Signing key not found');
    }

    if (key.isActive) {
      const decryptedSecret = decrypt(key.totpSecret);
      const verified = speakeasy.totp.verify({
        secret: decryptedSecret,
        encoding: 'base32',
        token: totpCode,
        window: 1,
      });

      if (!verified) {
        throw new UnauthorizedException('Invalid TOTP code');
      }
    }

    await this.keyRepo.remove(key);
  }

  async validateSigning(keyId: string, totpCode: string): Promise<boolean> {
    const key = await this.keyRepo.findOne({ where: { id: keyId } });
    if (!key || !key.isActive) {
      throw new NotFoundException('Active signing key not found');
    }

    const decryptedSecret = decrypt(key.totpSecret);
    const verified = speakeasy.totp.verify({
      secret: decryptedSecret,
      encoding: 'base32',
      token: totpCode,
      window: 1,
    });

    if (!verified) {
      throw new UnauthorizedException('Invalid TOTP code');
    }

    key.lastUsedAt = new Date();
    await this.keyRepo.save(key);
    return true;
  }

  async getUserKeys(userId: string): Promise<TransactionSigningKey[]> {
    return this.keyRepo.find({
      where: { userId, isActive: true },
      order: { minAmountUsd: 'ASC' },
    });
  }

  async requiresSigning(userId: string, amountUsd: string): Promise<boolean> {
    const activeKeys = await this.getUserKeys(userId);
    if (activeKeys.length === 0) {
      return false;
    }
    const amount = parseFloat(amountUsd);
    return activeKeys.some((key) => parseFloat(key.minAmountUsd) <= amount);
  }
}
