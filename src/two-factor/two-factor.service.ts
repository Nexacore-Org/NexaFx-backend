import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as speakeasy from 'speakeasy';
import * as qrcode from 'qrcode';
import { UsersService } from '../users/users.service';
import { EncryptionService } from '../common/services/encryption.service';
import { SetupTwoFactorResponseDto } from './dto/setup-two-factor-response.dto';
import { BackupCode } from './entities/backup-code.entity';

@Injectable()
export class TwoFactorService {
  constructor(
    private readonly usersService: UsersService,
    private readonly encryptionService: EncryptionService,
    @InjectRepository(BackupCode)
    private readonly backupCodesRepository: Repository<BackupCode>,
  ) {}

  async generateSecret(userId: string): Promise<SetupTwoFactorResponseDto> {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const secret = speakeasy.generateSecret({
      name: `${user.email}`,
      issuer: 'NexaFX',
      length: 20,
    });

    if (!secret.base32 || !secret.otpauth_url) {
      throw new BadRequestException('Failed to generate two-factor secret');
    }

    const encryptedSecret = this.encryptionService.encrypt(secret.base32);

    await this.usersService.updateByUserId(userId, {
      twoFactorSecret: encryptedSecret,
      isTwoFactorEnabled: false,
    });

    const qrCodeDataUrl = await qrcode.toDataURL(secret.otpauth_url);
    const qrCodePngBase64 = (await qrcode.toBuffer(secret.otpauth_url)).toString(
      'base64',
    );

    return {
      qrCodeDataUrl,
      otpauthUrl: secret.otpauth_url,
      qrCodePngBase64,
      manualEntryKey: secret.base32,
    };
  }

  async confirmTwoFactor(
    userId: string,
    totpCode: string,
  ): Promise<{ backupCodes: string[] }> {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.twoFactorSecret) {
      throw new BadRequestException(
        'Two-factor setup is required before enabling',
      );
    }

    const isValid = this.verifyTotp(user.twoFactorSecret, totpCode);

    if (!isValid) {
      throw new UnauthorizedException('Invalid two-factor code');
    }

    await this.usersService.updateByUserId(userId, {
      isTwoFactorEnabled: true,
    });

    await this.backupCodesRepository.delete({ userId });

    const backupCodes = this.generateBackupCodes(8);
    const rows = await Promise.all(
      backupCodes.map(async (code) => ({
        userId,
        codeHash: await bcrypt.hash(code, 10),
        consumedAt: null,
      })),
    );
    await this.backupCodesRepository.save(
      rows.map((r) => this.backupCodesRepository.create(r)),
    );

    return { backupCodes };
  }

  async disableTwoFactor(userId: string, totpCode: string): Promise<void> {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.isTwoFactorEnabled || !user.twoFactorSecret) {
      throw new BadRequestException('Two-factor authentication is not enabled');
    }

    const isValid = this.verifyTotp(user.twoFactorSecret, totpCode);

    if (!isValid) {
      throw new UnauthorizedException('Invalid two-factor code');
    }

    await this.usersService.updateByUserId(userId, {
      isTwoFactorEnabled: false,
      twoFactorSecret: null,
    });

    await this.backupCodesRepository.delete({ userId });
  }

  async verifyTotpCode(userId: string, totpCode: string): Promise<boolean> {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.twoFactorSecret || !user.isTwoFactorEnabled) {
      throw new BadRequestException('Two-factor authentication is not enabled');
    }

    return this.verifyTotp(user.twoFactorSecret, totpCode);
  }

  async recoverWithBackupCode(
    userId: string,
    backupCode: string,
  ): Promise<void> {
    const user = await this.usersService.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (!user.isTwoFactorEnabled) {
      throw new BadRequestException('Two-factor authentication is not enabled');
    }

    const codes = await this.backupCodesRepository.find({
      where: { userId, consumedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });

    for (const code of codes) {
      const match = await bcrypt.compare(backupCode, code.codeHash);
      if (!match) continue;

      code.consumedAt = new Date();
      await this.backupCodesRepository.save(code);
      return;
    }

    throw new UnauthorizedException('Invalid backup code');
  }

  async regenerateBackupCodes(
    userId: string,
    totpCode: string,
  ): Promise<{ backupCodes: string[] }> {
    const user = await this.usersService.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (!user.isTwoFactorEnabled || !user.twoFactorSecret) {
      throw new BadRequestException('Two-factor authentication is not enabled');
    }

    const isValid = this.verifyTotp(user.twoFactorSecret, totpCode);
    if (!isValid) throw new UnauthorizedException('Invalid two-factor code');

    await this.backupCodesRepository.delete({ userId });

    const backupCodes = this.generateBackupCodes(8);
    const rows = await Promise.all(
      backupCodes.map(async (code) => ({
        userId,
        codeHash: await bcrypt.hash(code, 10),
        consumedAt: null,
      })),
    );
    await this.backupCodesRepository.save(
      rows.map((r) => this.backupCodesRepository.create(r)),
    );

    return { backupCodes };
  }

  async getStatus(userId: string): Promise<{ isTwoFactorEnabled: boolean }> {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      isTwoFactorEnabled: user.isTwoFactorEnabled,
    };
  }

  private verifyTotp(encryptedSecret: string, totpCode: string): boolean {
    const secret = this.encryptionService.decrypt(encryptedSecret);

    return speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token: totpCode,
      window: 1,
    });
  }

  private generateBackupCodes(count: number): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      // 10 chars base32-ish; easy to read, easy to type.
      const raw = speakeasy.generateSecret({ length: 10 }).base32;
      codes.push(raw.replace(/=+$/g, '').slice(0, 10).toUpperCase());
    }
    return codes;
  }
}
