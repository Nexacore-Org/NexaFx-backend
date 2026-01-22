import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, MoreThan } from 'typeorm';
import * as crypto from 'crypto';
import { RefreshToken } from './refresh-token.entity';

@Injectable()
export class RefreshTokensService {
  private readonly TOKEN_BYTES = 48; // 48 bytes -> 64 chars base64url-ish when encoded without padding

  constructor(
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    private readonly configService: ConfigService,
  ) {}

  async createRefreshToken(userId: string): Promise<string> {
    const token = this.generateSecureToken();
    const tokenHash = this.hashRefreshToken(token);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.getRefreshTokenExpiryDays());

    const refreshToken = this.refreshTokenRepository.create({
      userId,
      tokenHash,
      expiresAt,
      revokedAt: null,
    });

    await this.refreshTokenRepository.save(refreshToken);

    return token;
  }

  async revokeAllUserTokens(userId: string): Promise<void> {
    await this.refreshTokenRepository.update(
      {
        userId,
        revokedAt: IsNull(),
      },
      {
        revokedAt: new Date(),
      },
    );
  }

  async revokeToken(tokenHash: string): Promise<void> {
    await this.refreshTokenRepository.update(
      { tokenHash },
      { revokedAt: new Date() },
    );
  }

  async validateRefreshToken(token: string): Promise<RefreshToken> {
    const tokenHash = this.hashRefreshToken(token);
    const stored = await this.refreshTokenRepository.findOne({
      where: {
        tokenHash,
        revokedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
    });

    if (!stored) throw new UnauthorizedException('Invalid or expired refresh token');
    return stored;
  }

  async cleanupExpiredTokens(): Promise<number> {
    const result = await this.refreshTokenRepository
      .createQueryBuilder()
      .delete()
      .from(RefreshToken)
      .where('expiresAt < :now', { now: new Date() })
      .andWhere('revokedAt IS NOT NULL')
      .execute();

    return result.affected || 0;
  }

  private generateSecureToken(): string {
    // base64url without padding; keeps token shorter than hex and URL-safe
    return crypto
      .randomBytes(this.TOKEN_BYTES)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  private getRefreshTokenSecret(): string {
    const secret = this.configService.get<string>('REFRESH_TOKEN_SECRET');
    if (!secret) {
      throw new Error('REFRESH_TOKEN_SECRET is not configured');
    }
    return secret;
  }

  private getRefreshTokenExpiryDays(): number {
    const v = this.configService.get<string>('REFRESH_TOKEN_EXPIRES_DAYS');
    const parsed = v ? Number(v) : 30;
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 90) return 30;
    return parsed;
  }

  private hashRefreshToken(token: string): string {
    // Strong one-way hash; DB lookup is by hash so we never need to scan/compare all tokens.
    return crypto
      .createHmac('sha256', this.getRefreshTokenSecret())
      .update(token)
      .digest('hex');
  }
}
