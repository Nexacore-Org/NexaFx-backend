import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as speakeasy from 'speakeasy';
import * as qrcode from 'qrcode';
import { UsersService } from '../users/users.service';
import { EncryptionService } from '../common/services/encryption.service';
import { SetupTwoFactorResponseDto } from './dto/setup-two-factor-response.dto';

@Injectable()
export class TwoFactorService {
  constructor(
    private readonly usersService: UsersService,
    private readonly encryptionService: EncryptionService,
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

    return {
      qrCodeDataUrl,
      manualEntryKey: secret.base32,
    };
  }

  async enableTwoFactor(userId: string, totpCode: string): Promise<void> {
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
}
