import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, Not } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { UAParser } from 'ua-parser-js';
import { UserSession, DeviceType } from './entities/user-session.entity';
import { RedisService } from '../../redis/redis.service';
import { RefreshTokensService } from '../../tokens/refresh-tokens.service';

@Injectable()
export class SessionsService {
  constructor(
    @InjectRepository(UserSession)
    private readonly userSessionRepository: Repository<UserSession>,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    @Inject(forwardRef(() => RefreshTokensService))
    private readonly refreshTokensService: RefreshTokensService,
  ) {}

  async createSession(
    userId: string,
    jti: string,
    userAgent: string,
    ipAddress: string,
    country = 'Unknown',
    city = 'Unknown',
  ): Promise<UserSession> {
    const parser = new UAParser(userAgent);
    const browser = parser.getBrowser().name || 'Unknown Browser';
    const os = parser.getOS().name || 'Unknown OS';
    const deviceModel = parser.getDevice().model;

    let deviceName = '';
    if (browser && deviceModel) {
      deviceName = `${browser} on ${deviceModel}`;
    } else if (browser && os) {
      deviceName = `${browser} on ${os}`;
    } else {
      deviceName = browser || os || 'Unknown Device';
    }

    const rawType = parser.getDevice().type;
    let deviceType = DeviceType.UNKNOWN;
    if (!rawType) {
      if (parser.getBrowser().name || parser.getOS().name) {
        deviceType = DeviceType.DESKTOP;
      }
    } else if (rawType === 'mobile') {
      deviceType = DeviceType.MOBILE;
    } else if (rawType === 'tablet') {
      deviceType = DeviceType.TABLET;
    }

    const expiresDays = this.getRefreshTokenExpiryDays();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresDays);

    const session = this.userSessionRepository.create({
      userId,
      tokenId: jti,
      deviceName,
      deviceType,
      browser,
      os,
      ipAddress,
      country: country || 'Unknown',
      city: city || 'Unknown',
      isTrusted: false,
      lastActiveAt: new Date(),
      expiresAt,
    });

    return this.userSessionRepository.save(session);
  }

  async getActiveSessions(userId: string, currentJti: string): Promise<any[]> {
    const sessions = await this.userSessionRepository.find({
      where: {
        userId,
        expiresAt: MoreThan(new Date()),
      },
      order: {
        lastActiveAt: 'DESC',
      },
    });

    return sessions.map((session) => ({
      id: session.id,
      deviceName: session.deviceName,
      deviceType: session.deviceType,
      browser: session.browser,
      os: session.os,
      ipAddress: session.ipAddress,
      country: session.country,
      city: session.city,
      isTrusted: session.isTrusted,
      lastActiveAt: session.lastActiveAt,
      createdAt: session.createdAt,
      isCurrent: session.tokenId === currentJti,
    }));
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const session = await this.userSessionRepository.findOne({
      where: { id: sessionId, userId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    // Set DB record as expired
    session.expiresAt = new Date(0);
    await this.userSessionRepository.save(session);

    // Delete Redis key immediately
    const redisKey = `nexafx:refresh:${userId}:${session.tokenId}`;
    await this.redisService.del(redisKey);

    // Revoke refresh token in database
    await this.refreshTokensService.revokeTokenByJti(userId, session.tokenId);
  }

  async revokeAllOtherSessions(
    userId: string,
    currentJti: string,
  ): Promise<void> {
    const otherSessions = await this.userSessionRepository.find({
      where: {
        userId,
        tokenId: Not(currentJti),
        expiresAt: MoreThan(new Date()),
      },
    });

    for (const session of otherSessions) {
      session.expiresAt = new Date(0);
      await this.userSessionRepository.save(session);

      const redisKey = `nexafx:refresh:${userId}:${session.tokenId}`;
      await this.redisService.del(redisKey);

      await this.refreshTokensService.revokeTokenByJti(userId, session.tokenId);
    }
  }

  async trustDevice(userId: string, sessionId: string): Promise<void> {
    const session = await this.userSessionRepository.findOne({
      where: { id: sessionId, userId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.expiresAt <= new Date()) {
      throw new BadRequestException('Cannot trust an expired session');
    }

    session.isTrusted = true;
    await this.userSessionRepository.save(session);
  }

  async isDeviceTrusted(
    userId: string,
    userAgent: string,
    ipAddress: string,
  ): Promise<boolean> {
    const parser = new UAParser(userAgent);
    const browser = parser.getBrowser().name || 'Unknown Browser';
    const os = parser.getOS().name || 'Unknown OS';
    const deviceModel = parser.getDevice().model;

    let deviceName = '';
    if (browser && deviceModel) {
      deviceName = `${browser} on ${deviceModel}`;
    } else if (browser && os) {
      deviceName = `${browser} on ${os}`;
    } else {
      deviceName = browser || os || 'Unknown Device';
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const trustedSessions = await this.userSessionRepository.find({
      where: {
        userId,
        isTrusted: true,
        lastActiveAt: MoreThan(thirtyDaysAgo),
      },
    });

    const targetRange = this.getIpRange(ipAddress);

    return trustedSessions.some((session) => {
      const sessionRange = this.getIpRange(session.ipAddress);
      const uaMatch =
        session.browser === browser &&
        session.os === os &&
        session.deviceName === deviceName;
      return uaMatch && sessionRange === targetRange;
    });
  }

  async updateLastActive(userId: string, jti: string): Promise<void> {
    const session = await this.userSessionRepository.findOne({
      where: { userId, tokenId: jti },
    });

    if (!session) return;

    const now = new Date();
    const diffMs = now.getTime() - session.lastActiveAt.getTime();
    const fiveMinutesMs = 5 * 60 * 1000;

    if (diffMs >= fiveMinutesMs) {
      session.lastActiveAt = now;
      await this.userSessionRepository.save(session);
    }
  }

  private getIpRange(ip: string): string {
    if (!ip) return '';
    let cleanIp = ip.trim();
    if (cleanIp.startsWith('::ffff:')) {
      cleanIp = cleanIp.substring(7);
    }
    if (cleanIp.includes('.')) {
      const parts = cleanIp.split('.');
      if (parts.length >= 3) {
        return `${parts[0]}.${parts[1]}.${parts[2]}`;
      }
    } else if (cleanIp.includes(':')) {
      const parts = cleanIp.split(':');
      if (parts.length >= 4) {
        return `${parts[0]}:${parts[1]}:${parts[2]}:${parts[3]}`;
      }
    }
    return cleanIp;
  }

  private getRefreshTokenExpiryDays(): number {
    const v = this.configService.get<string>('REFRESH_TOKEN_EXPIRES_DAYS');
    const parsed = v ? Number(v) : 30;
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 90) return 30;
    return parsed;
  }
}
