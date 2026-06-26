import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, MoreThan } from 'typeorm';
import * as crypto from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { RefreshToken } from './refresh-token.entity';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class RefreshTokensService {
  constructor(
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
  ) {}

  async createRefreshToken(userId: string, jti: string): Promise<string> {
    const expiresDays = this.getRefreshTokenExpiryDays();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresDays);

    const payload = {
      sub: userId,
      jti,
    };

    const token = this.jwtService.sign(payload, {
      secret: this.getRefreshTokenSecret(),
      expiresIn: `${expiresDays}d`,
    });

    const tokenHash = this.hashRefreshToken(token);

    const refreshToken = this.refreshTokenRepository.create({
      userId,
      tokenHash,
      expiresAt,
      revokedAt: null,
      jti,
    });

    await this.refreshTokenRepository.save(refreshToken);

    // Save in Redis
    const redisKey = `nexafx:refresh:${userId}:${jti}`;
    const ttlSeconds = expiresDays * 24 * 60 * 60;
    await this.redisService.set(redisKey, 'active', ttlSeconds);

    return token;
  }

  async revokeAllUserTokens(userId: string): Promise<void> {
    // Revoke all in DB
    await this.refreshTokenRepository.update(
      {
        userId,
        revokedAt: IsNull(),
      },
      {
        revokedAt: new Date(),
      },
    );

    // Find all active JTIs to delete from Redis
    const activeTokens = await this.refreshTokenRepository.find({
      where: {
        userId,
        jti: IsNull() ? undefined : MoreThan(''), // non-empty/null JTIs
      },
    });

    for (const token of activeTokens) {
      if (token.jti) {
        const redisKey = `nexafx:refresh:${userId}:${token.jti}`;
        await this.redisService.del(redisKey);
      }
    }
  }

  async revokeToken(tokenHash: string): Promise<void> {
    const token = await this.refreshTokenRepository.findOne({
      where: { tokenHash },
    });

    if (token) {
      token.revokedAt = new Date();
      await this.refreshTokenRepository.save(token);

      if (token.jti) {
        const redisKey = `nexafx:refresh:${token.userId}:${token.jti}`;
        await this.redisService.del(redisKey);
      }
    }
  }

  async revokeTokenByJti(userId: string, jti: string): Promise<void> {
    await this.refreshTokenRepository.update(
      {
        userId,
        jti,
        revokedAt: IsNull(),
      },
      {
        revokedAt: new Date(),
      },
    );

    const redisKey = `nexafx:refresh:${userId}:${jti}`;
    await this.redisService.del(redisKey);
  }

  async validateRefreshToken(token: string): Promise<RefreshToken> {
    let payload: any;
    try {
      payload = this.jwtService.verify(token, {
        secret: this.getRefreshTokenSecret(),
      });
    } catch (err) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const { sub: userId, jti } = payload;
    if (!userId || !jti) {
      throw new UnauthorizedException('Invalid refresh token payload');
    }

    // Check Redis key existence
    const redisKey = `nexafx:refresh:${userId}:${jti}`;
    const redisVal = await this.redisService.get(redisKey);
    if (!redisVal) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const tokenHash = this.hashRefreshToken(token);
    const stored = await this.refreshTokenRepository.findOne({
      where: {
        tokenHash,
        revokedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
    });

    if (!stored) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

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
    return crypto
      .createHmac('sha256', this.getRefreshTokenSecret())
      .update(token)
      .digest('hex');
  }

  async revokeRefreshToken(token: string): Promise<void> {
    const tokenHash = this.hashRefreshToken(token);
    await this.revokeToken(tokenHash);
  }
}
