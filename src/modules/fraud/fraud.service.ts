import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { GeoService } from './geo.service';
import { GeoCacheService } from './geo-cache.service';
import {
  FraudAlert,
  FraudAlertType,
  FraudAlertStatus,
} from './entities/fraud-alert.entity';
import { LoginAttempt } from './entities/login-attempt.entity';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';

export interface RiskResult {
  score: number;
  reasons: string[];
  geoData: {
    country: string | null;
    city: string | null;
    latitude: number | null;
    longitude: number | null;
    isp: string | null;
  };
  isBlocked: boolean;
  requiresVerification: boolean;
}

@Injectable()
export class FraudService {
  private readonly logger = new Logger(FraudService.name);
  private readonly DISTANCE_THRESHOLD_KM = 500;
  private readonly TIME_THRESHOLD_MINUTES = 60;

  constructor(
    private readonly geoService: GeoService,
    private readonly geoCacheService: GeoCacheService,
    private readonly configService: ConfigService,
    private readonly auditLogsService: AuditLogsService,
    @InjectRepository(FraudAlert)
    private readonly fraudAlertRepository: Repository<FraudAlert>,
    @InjectRepository(LoginAttempt)
    private readonly loginAttemptRepository: Repository<LoginAttempt>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async assessLoginRisk(
    userId: string,
    email: string,
    ipAddress: string,
  ): Promise<RiskResult> {
    const geoData = this.geoService.lookup(ipAddress);

    if (!geoData.country && !geoData.latitude) {
      return {
        score: 0,
        reasons: [],
        geoData,
        isBlocked: false,
        requiresVerification: false,
      };
    }

    let score = 0;
    const reasons: string[] = [];

    const blockedCountries = this.getBlockedCountries();
    if (
      geoData.country &&
      blockedCountries.includes(geoData.country.toUpperCase())
    ) {
      await this.createFraudAlert(
        userId,
        null,
        FraudAlertType.HIGH_RISK_COUNTRY,
        80,
        { reason: 'country_blocked', country: geoData.country, geoData, ipAddress },
      );

      await this.logFraudBlocked(userId, email, ipAddress, geoData);

      return {
        score: 80,
        reasons: ['country_blocked'],
        geoData,
        isBlocked: true,
        requiresVerification: false,
      };
    }

    const previousCountries = await this.getPreviousLoginCountries(userId);
    if (
      geoData.country &&
      previousCountries.length > 0 &&
      !previousCountries.includes(geoData.country)
    ) {
      score += 20;
      reasons.push(`new_country:${geoData.country}`);
    }

    if (geoData.latitude != null && geoData.longitude != null) {
      const impossibleTravel = await this.checkImpossibleTravel(
        userId,
        geoData.latitude,
        geoData.longitude,
      );
      if (impossibleTravel) {
        score += 30;
        reasons.push('impossible_travel');
      }
    }

    if (geoData.isp) {
      if (this.isSuspiciousIsp(geoData.isp)) {
        score += 20;
        reasons.push('suspicious_ip');
      }
    }

    const cappedScore = Math.min(score, 100);
    const requiresVerification = cappedScore >= 50 && cappedScore < 80;
    const isBlocked = cappedScore >= 80;

    if (isBlocked) {
      await this.logFraudBlocked(userId, email, ipAddress, geoData);
      await this.createFraudAlert(
        userId,
        null,
        FraudAlertType.HIGH_RISK_SCORE,
        cappedScore,
        { reasons, geoData, ipAddress },
      );
    }

    if (reasons.some((r) => r.startsWith('impossible_travel'))) {
      await this.createFraudAlert(
        userId,
        null,
        FraudAlertType.IMPOSSIBLE_TRAVEL,
        cappedScore,
        { reasons, geoData, ipAddress },
      );
    }

    if (reasons.some((r) => r.startsWith('suspicious_ip'))) {
      await this.createFraudAlert(
        userId,
        null,
        FraudAlertType.SUSPICIOUS_IP,
        cappedScore,
        { reasons, geoData, ipAddress },
      );
    }

    if (requiresVerification) {
      await this.createFraudAlert(
        userId,
        null,
        FraudAlertType.HIGH_RISK_SCORE,
        cappedScore,
        { reasons, geoData, ipAddress },
      );
    }

    return {
      score: cappedScore,
      reasons,
      geoData,
      isBlocked,
      requiresVerification,
    };
  }

  async recordLoginAttempt(
    userId: string,
    email: string,
    ipAddress: string,
    riskResult: RiskResult,
    blocked: boolean,
  ): Promise<LoginAttempt> {
    const attempt = this.loginAttemptRepository.create({
      userId,
      email,
      country: riskResult.geoData.country,
      city: riskResult.geoData.city,
      latitude: riskResult.geoData.latitude,
      longitude: riskResult.geoData.longitude,
      isp: riskResult.geoData.isp,
      riskScore: riskResult.score,
      blocked,
      ipAddress,
    });

    return this.loginAttemptRepository.save(attempt);
  }

  async updateLoginLocation(
    userId: string,
    latitude: number,
    longitude: number,
  ): Promise<void> {
    await this.geoCacheService.set(userId, latitude, longitude, new Date());
  }

  private async checkImpossibleTravel(
    userId: string,
    currentLat: number,
    currentLng: number,
  ): Promise<boolean> {
    try {
      const lastLocation = await this.geoCacheService.get(userId);
      if (!lastLocation) return false;

      const distance = this.calculateDistance(
        lastLocation.latitude,
        lastLocation.longitude,
        currentLat,
        currentLng,
      );

      const timeDiffMinutes =
        (Date.now() - new Date(lastLocation.loginAt).getTime()) / (1000 * 60);

      return (
        distance > this.DISTANCE_THRESHOLD_KM &&
        timeDiffMinutes < this.TIME_THRESHOLD_MINUTES
      );
    } catch (error) {
      this.logger.warn(
        `Impossible travel check failed for user ${userId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  private async getPreviousLoginCountries(userId: string): Promise<string[]> {
    try {
      const results = await this.loginAttemptRepository.find({
        where: { userId, blocked: false },
        select: ['country'],
        order: { createdAt: 'DESC' },
        take: 20,
      });

      return [
        ...new Set(
          results.map((r) => r.country).filter((c): c is string => !!c),
        ),
      ];
    } catch {
      return [];
    }
  }

  private async logFraudBlocked(
    userId: string,
    email: string,
    ipAddress: string,
    geoData: any,
  ): Promise<void> {
    await this.auditLogsService.logAuthEvent(
      userId,
      'FRAUD_LOGIN_BLOCKED',
      {
        email,
        ip: ipAddress,
        country: geoData.country,
        city: geoData.city,
        isp: geoData.isp,
      },
      true,
    );
  }

  private async createFraudAlert(
    userId: string,
    loginAttemptId: string | null,
    alertType: FraudAlertType,
    riskScore: number,
    details: Record<string, any>,
  ): Promise<FraudAlert> {
    const alert = this.fraudAlertRepository.create({
      userId,
      loginAttemptId,
      alertType,
      riskScore,
      details,
      status: FraudAlertStatus.OPEN,
    });

    return this.fraudAlertRepository.save(alert);
  }

  private getBlockedCountries(): string[] {
    const raw = this.configService.get<string>('BLOCKED_COUNTRIES');
    if (!raw) return [];
    return raw
      .split(',')
      .map((c) => c.trim().toUpperCase())
      .filter((c) => c.length === 2);
  }

  private isSuspiciousIsp(isp: string): boolean {
    const lower = isp.toLowerCase();
    const keywords = [
      'tor',
      'vpn',
      'proxy',
      'anonymizer',
      'anonymize',
      'anonymous',
      'freetore',
      'torexit',
      'privax',
      'hidemyass',
      'socks',
      'shadowsocks',
    ];
    return keywords.some((k) => lower.includes(k));
  }

  async getFraudAlerts(filters: {
    status?: FraudAlertStatus;
    alertType?: FraudAlertType;
    userId?: string;
    page?: number;
    limit?: number;
  }) {
    const query = this.dataSource
      .getRepository(FraudAlert)
      .createQueryBuilder('alert')
      .orderBy('alert.createdAt', 'DESC');

    if (filters.status) {
      query.andWhere('alert.status = :status', { status: filters.status });
    }
    if (filters.alertType) {
      query.andWhere('alert.alertType = :alertType', {
        alertType: filters.alertType,
      });
    }
    if (filters.userId) {
      query.andWhere('alert.userId = :userId', { userId: filters.userId });
    }

    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const skip = (page - 1) * limit;

    query.skip(skip).take(limit);

    const [alerts, total] = await query.getManyAndCount();

    return {
      alerts,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async updateFraudAlertStatus(
    alertId: string,
    status: FraudAlertStatus,
  ): Promise<FraudAlert | null> {
    const alert = await this.fraudAlertRepository.findOne({
      where: { id: alertId },
    });
    if (!alert) return null;

    alert.status = status;
    return this.fraudAlertRepository.save(alert);
  }

  private calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const R = 6371;
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return (deg * Math.PI) / 180;
  }
}
