import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import * as crypto from 'crypto';
import * as speakeasy from 'speakeasy';
import * as qrcode from 'qrcode';
import * as bcrypt from 'bcrypt';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { EncryptionService } from '../common/services/encryption.service';
import { SetupTwoFactorResponseDto } from './dto/setup-two-factor-response.dto';
import { BackupCode } from './entities/backup-code.entity';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../audit-logs/enums/audit-action.enum';
import { RefreshTokensService } from '../tokens/refresh-tokens.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import type { User } from '../users/user.entity';

const TOTP_STEP_SECONDS = 30;
const TOTP_WINDOW_STEPS = 1;
const DEFAULT_MAX_FAILED_ATTEMPTS = 5;
const DEFAULT_LOCKOUT_MINUTES = 15;

@Injectable()
export class TwoFactorService {
  constructor(
    @InjectRepository(BackupCode)
    private readonly backupCodeRepository: Repository<BackupCode>,
    private readonly usersService: UsersService,
    private readonly encryptionService: EncryptionService,
    private readonly auditLogsService: AuditLogsService,
    private readonly configService: ConfigService,
    private readonly refreshTokensService: RefreshTokensService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async generateSecret(userId: string): Promise<SetupTwoFactorResponseDto> {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Setup used to overwrite twoFactorSecret and clear isTwoFactorEnabled for
    // any authenticated caller, which let a stolen access token drop the
    // second factor without the TOTP that /two-factor/disable demands.
    if (user.isTwoFactorEnabled) {
      throw new ConflictException(
        'Two-factor authentication is already enabled. Disable it before enrolling again.',
      );
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
      pendingTwoFactorSecret: encryptedSecret,
    });

    await this.audit(userId, AuditAction.TWO_FACTOR_SETUP);

    const qrCodeDataUrl = await qrcode.toDataURL(secret.otpauth_url);

    return {
      otpauthUrl: secret.otpauth_url,
      qrCodeDataUrl,
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

    const secretToConfirm = user.pendingTwoFactorSecret ?? user.twoFactorSecret;

    if (!secretToConfirm) {
      throw new BadRequestException(
        'Two-factor setup is required before enabling',
      );
    }

    const step = await this.checkTotpCode(user, secretToConfirm, totpCode);
    if (step === null) {
      throw new UnauthorizedException('Invalid two-factor code');
    }

    // Promote the pending secret only now, so an abandoned setup leaves the
    // active factor untouched.
    await this.usersService.updateByUserId(userId, {
      twoFactorSecret: secretToConfirm,
      pendingTwoFactorSecret: null,
      isTwoFactorEnabled: true,
      lastTotpStep: step,
      twoFactorFailedAttempts: 0,
      twoFactorLockedUntil: null,
    });

    const backupCodes = await this.replaceBackupCodes(userId);

    await this.audit(userId, AuditAction.TWO_FACTOR_ENABLED);

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

    const step = await this.checkTotpCode(user, user.twoFactorSecret, totpCode);
    if (step === null) {
      throw new UnauthorizedException('Invalid two-factor code');
    }

    await this.usersService.updateByUserId(userId, {
      isTwoFactorEnabled: false,
      twoFactorSecret: null,
      pendingTwoFactorSecret: null,
      lastTotpStep: null,
      twoFactorFailedAttempts: 0,
      twoFactorLockedUntil: null,
    });

    await this.backupCodeRepository.delete({ userId });
    await this.refreshTokensService.revokeAllUserTokens(userId);
    await this.notifySecurity(
      userId,
      'Two-factor authentication disabled',
      'Two-factor authentication was disabled on your account. Contact support if this was not you.',
    );

    await this.audit(userId, AuditAction.TWO_FACTOR_DISABLED);
  }

  /**
   * Verifies a login-time TOTP code.
   *
   * The matched time step is recorded, so a code that is shoulder-surfed or
   * leaked cannot be replayed inside its ~30 second window. Failures are
   * counted per user and lock verification for a configurable period.
   */
  async verifyTotpCode(userId: string, totpCode: string): Promise<boolean> {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.twoFactorSecret || !user.isTwoFactorEnabled) {
      throw new BadRequestException('Two-factor authentication is not enabled');
    }

    const step = await this.checkTotpCode(user, user.twoFactorSecret, totpCode);

    // A wrong or replayed code keeps the historical contract of this method:
    // return false and let the caller raise the 401.
    if (step === null) {
      return false;
    }

    await this.usersService.updateByUserId(userId, {
      twoFactorFailedAttempts: 0,
      twoFactorLockedUntil: null,
    });

    await this.audit(userId, AuditAction.TWO_FACTOR_VERIFIED);

    return true;
  }

  async consumeBackupCode(userId: string, backupCode: string): Promise<void> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.isTwoFactorEnabled) {
      throw new BadRequestException('Two-factor authentication is not enabled');
    }

    this.assertNotLocked(user);

    const codes = await this.backupCodeRepository.find({
      where: { userId, consumedAt: IsNull() },
    });

    for (const codeEntity of codes) {
      const ok = await bcrypt.compare(backupCode, codeEntity.codeHash);
      if (!ok) {
        continue;
      }

      // Conditional update: two concurrent requests can both pass the bcrypt
      // comparison, but only one can flip consumedAt from NULL.
      const result = await this.backupCodeRepository.update(
        { id: codeEntity.id, consumedAt: IsNull() },
        { consumedAt: new Date() },
      );

      if ((result.affected ?? 0) === 1) {
        await this.usersService.updateByUserId(userId, {
          twoFactorFailedAttempts: 0,
          twoFactorLockedUntil: null,
        });
        return;
      }
    }

    await this.registerFailedAttempt(user);
    await this.audit(userId, AuditAction.TWO_FACTOR_FAILED, {
      reason: 'invalid_backup_code',
    });

    throw new UnauthorizedException('Invalid backup code');
  }

  async regenerateBackupCodes(
    userId: string,
    totpCode: string,
  ): Promise<{ backupCodes: string[] }> {
    const user = await this.usersService.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    if (!user.twoFactorSecret || !user.isTwoFactorEnabled) {
      throw new BadRequestException('Two-factor authentication is not enabled');
    }

    const step = await this.checkTotpCode(user, user.twoFactorSecret, totpCode);
    if (step === null) {
      throw new UnauthorizedException('Invalid two-factor code');
    }

    const backupCodes = await this.replaceBackupCodes(userId);

    await this.audit(userId, AuditAction.TWO_FACTOR_BACKUP_CODES_REGENERATED);

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

  private async replaceBackupCodes(userId: string): Promise<string[]> {
    await this.backupCodeRepository.delete({ userId });
    const backupCodes = this.generateBackupCodes(8);
    const saltRounds = 12;
    const entities = await Promise.all(
      backupCodes.map(async (code) =>
        this.backupCodeRepository.create({
          userId,
          codeHash: await bcrypt.hash(code, saltRounds),
          consumedAt: null,
        }),
      ),
    );
    await this.backupCodeRepository.save(entities);

    return backupCodes;
  }

  private async checkTotpCode(
    user: User,
    encryptedSecret: string,
    totpCode: string,
  ): Promise<number | null> {
    this.assertNotLocked(user);

    const step = this.matchTotpStep(encryptedSecret, totpCode);
    const isReplay =
      step !== null &&
      user.lastTotpStep !== null &&
      step <= user.lastTotpStep;

    if (step === null || isReplay) {
      await this.registerFailedAttempt(user);
      await this.audit(
        user.id,
        AuditAction.TWO_FACTOR_FAILED,
        isReplay ? { reason: 'replay' } : { reason: 'invalid_code' },
      );
      return null;
    }

    const accepted = await this.usersService.acceptTotpStep(user.id, step);
    if (!accepted) {
      await this.registerFailedAttempt(user);
      await this.audit(user.id, AuditAction.TWO_FACTOR_FAILED, {
        reason: 'replay',
      });
      return null;
    }

    return step;
  }

  /**
   * Returns the time step the code matched, or null when it matches nothing.
   *
   * Checking each step explicitly (instead of speakeasy's window option) is
   * what makes replay detection possible: window:1 would happily accept the
   * previous step again.
   */
  private matchTotpStep(encryptedSecret: string, totpCode: string): number | null {
    const secret = this.encryptionService.decrypt(encryptedSecret);
    const nowStep = Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS);

    for (
      let step = nowStep - TOTP_WINDOW_STEPS;
      step <= nowStep + TOTP_WINDOW_STEPS;
      step++
    ) {
      const matches = speakeasy.totp.verify({
        secret,
        encoding: 'base32',
        token: totpCode,
        window: 0,
        epoch: step * TOTP_STEP_SECONDS,
      });
      if (matches) {
        return step;
      }
    }

    return null;
  }

  private assertNotLocked(user: User): void {
    const lockedUntil = user.twoFactorLockedUntil;
    if (!lockedUntil) {
      return;
    }

    const remainingMs = lockedUntil.getTime() - Date.now();
    if (remainingMs <= 0) {
      return;
    }

    throw new ThrottlerException(
      `Two-factor verification is locked. Try again in ${Math.ceil(
        remainingMs / 60_000,
      )} minute(s).`,
    );
  }

  private async registerFailedAttempt(user: User): Promise<void> {
    await this.usersService.incrementTwoFactorFailedAttempts(
      user.id,
      this.maxFailedAttempts(),
      this.lockoutMinutes(),
    );
  }

  private maxFailedAttempts(): number {
    const parsed = parseInt(
      this.configService.get<string>('TWO_FACTOR_MAX_FAILED_ATTEMPTS') ??
        String(DEFAULT_MAX_FAILED_ATTEMPTS),
      10,
    );
    return Number.isFinite(parsed) && parsed > 0
      ? parsed
      : DEFAULT_MAX_FAILED_ATTEMPTS;
  }

  private lockoutMinutes(): number {
    const parsed = parseInt(
      this.configService.get<string>('TWO_FACTOR_LOCKOUT_MINUTES') ??
        String(DEFAULT_LOCKOUT_MINUTES),
      10,
    );
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_LOCKOUT_MINUTES;
  }

  private async audit(
    userId: string,
    action: AuditAction,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.auditLogsService.logAuthEvent(userId, action, metadata);
    } catch {
      // Auditing must never break a two-factor flow.
    }
  }

  private async notifySecurity(
    userId: string,
    title: string,
    body: string,
  ): Promise<void> {
    try {
      await this.notificationsService.create(
        userId,
        NotificationType.SECURITY_ALERT,
        title,
        body,
      );
    } catch {
      return;
    }
  }

  private generateBackupCodes(count: number): string[] {
    // Human-friendly: 10 chars from Crockford-ish alphabet without 0/O/I/1
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const length = 10;
    const codes = new Set<string>();

    while (codes.size < count) {
      let code = '';
      for (let i = 0; i < length; i++) {
        code += alphabet[crypto.randomInt(alphabet.length)];
      }
      codes.add(code);
    }

    return Array.from(codes);
  }
}