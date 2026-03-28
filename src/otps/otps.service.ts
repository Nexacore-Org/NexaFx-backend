import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, IsNull } from 'typeorm';
import * as crypto from 'crypto';
import { Otp, OtpType } from './otp.entity';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';

@Injectable()
export class OtpsService {
  private readonly OTP_LENGTH = 6;
  private readonly MAX_FAILED_ATTEMPTS = 5;

  constructor(
    @InjectRepository(Otp)
    private readonly otpRepository: Repository<Otp>,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {}

  async generateOtp(user: User, type: OtpType): Promise<string> {
    if (!user || !user.id) {
      throw new BadRequestException('Invalid user');
    }

    await this.invalidateAllUserOtps(user.id, type);

    const otpCode = this.generateSecureOtp();
    const codeHash = this.hashOtp({ userId: user.id, type, otp: otpCode });

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + this.getOtpExpiryMinutes());

    const otp = this.otpRepository.create({
      userId: user.id,
      codeHash,
      type,
      expiresAt,
      usedAt: null,
    });

    await this.otpRepository.save(otp);

    return otpCode;
  }

  async validateOtp(user: User, code: string, type: OtpType): Promise<boolean> {
    if (!user || !user.id) {
      throw new BadRequestException('Invalid user');
    }

    const lockedUntil = this.getUserLockedUntil(user);
    if (lockedUntil && lockedUntil > new Date()) {
      const remainingMinutes = Math.ceil(
        (lockedUntil.getTime() - Date.now()) / 60000,
      );
      throw new ThrottlerException(
        `Too many failed attempts. Please try again in ${remainingMinutes} minute(s)`,
      );
    }

    if (!code || code.length !== this.OTP_LENGTH) {
      throw new UnauthorizedException('Invalid OTP format');
    }

    const otp = await this.otpRepository.findOne({
      where: {
        userId: user.id,
        type,
        usedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
      order: {
        createdAt: 'DESC',
      },
    });

    if (!otp) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    const expectedHash = this.hashOtp({ userId: user.id, type, otp: code });
    const isValid = this.timingSafeEqualHex(otp.codeHash, expectedHash);

    if (!isValid) {
      await this.handleFailedOtpAttempt(user);
      throw new UnauthorizedException('Invalid OTP code');
    }

    await this.otpRepository.update(otp.id, { usedAt: new Date() });

    return true;
  }

  async invalidateAllUserOtps(userId: string, type?: OtpType): Promise<void> {
    const whereCondition: any = {
      userId,
      usedAt: IsNull(),
    };

    if (type) {
      whereCondition.type = type;
    }

    await this.otpRepository.update(whereCondition, {
      usedAt: new Date(),
    });
  }

  async cleanupExpiredOtps(): Promise<number> {
    const result = await this.otpRepository
      .createQueryBuilder()
      .delete()
      .from(Otp)
      .where('expiresAt < :now', { now: new Date() })
      .andWhere('usedAt IS NOT NULL')
      .execute();

    return result.affected || 0;
  }

  private getUserLockedUntil(user: User): Date | null {
    if (!user.lockedUntil) return null;
    if (new Date() >= user.lockedUntil) return null;
    return user.lockedUntil;
  }

  private async handleFailedOtpAttempt(user: User): Promise<void> {
    const lockoutMinutes = this.getLockoutDurationMinutes();
    const newAttempts = (user.failedLoginAttempts || 0) + 1;

    if (newAttempts >= this.MAX_FAILED_ATTEMPTS) {
      const lockedUntil = new Date();
      lockedUntil.setMinutes(lockedUntil.getMinutes() + lockoutMinutes);
      await this.usersService.updateByUserId(user.id, {
        failedLoginAttempts: newAttempts,
        lockedUntil,
      });
    } else {
      await this.usersService.updateByUserId(user.id, {
        failedLoginAttempts: newAttempts,
      });
    }
  }

  private getLockoutDurationMinutes(): number {
    const v = this.configService.get<string>('AUTH_LOCKOUT_DURATION_MINUTES');
    const parsed = v ? Number(v) : 15;
    if (!Number.isFinite(parsed) || parsed <= 0) return 15;
    return parsed;
  }

  private generateSecureOtp(): string {
    const min = Math.pow(10, this.OTP_LENGTH - 1);
    const max = Math.pow(10, this.OTP_LENGTH) - 1;
    const randomNumber = crypto.randomInt(min, max + 1);
    return randomNumber.toString().padStart(this.OTP_LENGTH, '0');
  }

  private getOtpSecret(): string {
    const secret = this.configService.get<string>('OTP_SECRET');
    if (!secret) {
      // fail-safe: do not allow predictable hashing in production deployments
      throw new Error('OTP_SECRET is not configured');
    }
    return secret;
  }

  private getOtpExpiryMinutes(): number {
    const v = this.configService.get<string>('OTP_EXPIRES_MINUTES');
    const parsed = v ? Number(v) : 10;
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 60) return 10;
    return parsed;
  }

  private hashOtp(params: {
    userId: string;
    type: OtpType;
    otp: string;
  }): string {
    // HMAC-based hashing gives constant-time validation without storing OTPs or bcrypt costs.
    return crypto
      .createHmac('sha256', this.getOtpSecret())
      .update(`${params.userId}:${params.type}:${params.otp}`)
      .digest('hex');
  }

  private timingSafeEqualHex(aHex: string, bHex: string): boolean {
    // Constant-time compare. If lengths differ, compare against self to keep timing stable.
    const a = Buffer.from(aHex, 'hex');
    const b = Buffer.from(bHex, 'hex');
    if (a.length !== b.length) {
      return crypto.timingSafeEqual(a, a) && false;
    }
    return crypto.timingSafeEqual(a, b);
  }
}
