import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  KycScreening,
  ScreeningStatus,
  ScreeningProvider,
} from './entities/kyc-screening.entity';
import { User, UserKycTier } from '../users/user.entity';
import { OpenSanctionsProvider } from './providers/open-sanctions.provider';
import { OfacProvider } from './providers/ofac.provider';
import { WatchlistMatch } from './interfaces/watchlist-provider.interface';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditEntityType } from '../audit-logs/enums/audit-entity-type.enum';

const SCORE_WARNING_THRESHOLD = 30;
const SCORE_BLOCK_THRESHOLD = 70;

export enum UserScreeningStatus {
  VERIFIED = 'VERIFIED',
  UNDER_REVIEW = 'UNDER_REVIEW',
}

@Injectable()
export class SanctionsService {
  private readonly logger = new Logger(SanctionsService.name);

  constructor(
    @InjectRepository(KycScreening)
    private readonly screeningRepo: Repository<KycScreening>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly openSanctions: OpenSanctionsProvider,
    private readonly ofac: OfacProvider,
    @Optional()
    private readonly auditLogsService?: AuditLogsService,
  ) {}

  static toUserFacingScreening(screening: KycScreening | null | undefined): {
    status: UserScreeningStatus;
    updatedAt: Date | null;
  } {
    return {
      status:
        screening?.status === ScreeningStatus.CLEAR
          ? UserScreeningStatus.VERIFIED
          : UserScreeningStatus.UNDER_REVIEW,
      updatedAt: screening?.overriddenAt ?? screening?.createdAt ?? null,
    };
  }

  async screenUser(userId: string, actorId?: string): Promise<KycScreening> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    // Screen the person, never the identifier: a UUID matches no list and
    // silently clears the user. Names live on the user, because the live KYC
    // flow (kyc_applications) stores documents only.
    const fullName = [user.firstName, user.lastName]
      .filter((part): part is string => Boolean(part && part.trim()))
      .join(' ')
      .trim();

    if (!fullName) {
      throw new ForbiddenException('Cannot screen a user with no name on file');
    }

    // Date of birth and nationality are not collected anywhere yet.
    const query = { fullName };

    const primary = await this.openSanctions.screen(query);
    let matches: WatchlistMatch[] = primary.matches;
    let provider = ScreeningProvider.OPEN_SANCTIONS;
    // An outage must never look like "no matches": that is how a sanctions
    // control silently clears people.
    let providerFailed = primary.failed;

    if (matches.length === 0) {
      const fallback = await this.ofac.screen(query);
      if (fallback.matches.length > 0) {
        // Only credit OFAC when it actually produced the decision.
        matches = fallback.matches;
        provider = ScreeningProvider.OFAC;
        providerFailed = false;
      } else if (fallback.failed) {
        providerFailed = true;
      }
    }

    const topScore =
      matches.length > 0 ? Math.max(...matches.map((m) => m.score)) : 0;

    const status = providerFailed
      ? ScreeningStatus.ERROR
      : this.resolveStatus(topScore);

    const screening =
      this.screeningRepo.create({
        userId,
        fullName,
        dateOfBirth: null,
        nationality: null,
        score: topScore,
        status,
        provider,
        matches: matches as unknown as object[],
      }) ??
      ({
        userId,
        fullName,
        dateOfBirth: null,
        nationality: null,
        score: topScore,
        status,
        provider,
        matches: matches as unknown as object[],
      } as KycScreening);

    const saved = (await this.screeningRepo.save(screening)) ?? screening;

    await this.recordAuditLog({
      actorId: actorId ?? userId,
      userId,
      targetId: userId,
      action: 'SANCTIONS_SCREEN_USER',
      entityId: saved.id,
      metadata: {
        userId,
        status: saved.status,
        score: saved.score,
        provider: saved.provider,
        triggeredBy: actorId ?? 'SYSTEM',
      },
    });

    this.logger.log(
      `Screened user ${userId}: score=${topScore} status=${status} provider=${provider} failed=${providerFailed}`,
    );

    return saved;
  }

  async getLatestScreening(userId: string): Promise<KycScreening | null> {
    return this.screeningRepo.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async getUserScreeningStatus(userId: string): Promise<{
    status: UserScreeningStatus;
    updatedAt: Date | null;
  }> {
    const screening = await this.getLatestScreening(userId);
    return SanctionsService.toUserFacingScreening(screening);
  }

  async listScreenings(
    status?: ScreeningStatus,
    page = 1,
    limit = 20,
  ): Promise<{ data: KycScreening[]; total: number }> {
    if (
      status !== undefined &&
      !Object.values(ScreeningStatus).includes(status)
    ) {
      throw new BadRequestException(`Invalid screening status: ${status}`);
    }
    if (!Number.isInteger(page) || page < 1) {
      throw new BadRequestException('page must be an integer >= 1');
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException(
        'limit must be an integer between 1 and 100',
      );
    }

    const qb = this.screeningRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.user', 'user')
      .orderBy('s.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (status) {
      qb.where('s.status = :status', { status });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async overrideScreening(
    screeningId: string,
    adminUserId: string,
    reason: string,
  ): Promise<KycScreening> {
    const screening = await this.screeningRepo.findOne({
      where: { id: screeningId },
    });

    if (!screening) {
      throw new NotFoundException(`Screening ${screeningId} not found`);
    }

    if (screening.status === ScreeningStatus.CLEAR) {
      throw new ForbiddenException('Screening is already CLEAR');
    }

    if (screening.status === ScreeningStatus.ERROR) {
      throw new BadRequestException(
        'Cannot override an ERROR screening; run a successful re-screen first',
      );
    }

    const previousStatus = screening.status;
    screening.status = ScreeningStatus.CLEAR;
    screening.overriddenBy = adminUserId;
    screening.overrideReason = reason;
    screening.overriddenAt = new Date();

    await this.screeningRepo.save(screening);

    await this.recordAuditLog({
      actorId: adminUserId,
      userId: screening.userId,
      targetId: screening.userId,
      action: 'SANCTIONS_SCREENING_OVERRIDE',
      entityId: screening.id,
      metadata: {
        screeningId: screening.id,
        previousStatus,
        newStatus: ScreeningStatus.CLEAR,
        reason,
        overriddenBy: adminUserId,
      },
    });

    this.logger.log(
      `Screening ${screeningId} overridden by ${adminUserId}: ${reason}`,
    );

    return screening;
  }

  async rescreenAllUsers(): Promise<{ processed: number; failed: number }> {
    this.logger.log('Starting monthly re-screening of all users');

    // Drive the re-screen from users holding a verified tier; the legacy
    // kyc_records query filtered on a lowercase 'approved' and matched nobody.
    const users = await this.userRepo
      .createQueryBuilder('user')
      .select(['user.id'])
      .where('user.kycTier IN (:...tiers)', {
        tiers: [UserKycTier.STANDARD, UserKycTier.ENHANCED],
      })
      .orderBy('user.id', 'ASC')
      .getMany();

    let processed = 0;
    let failed = 0;

    for (const { id: userId } of users) {
      try {
        await this.screenUser(userId);
        processed++;
      } catch (error) {
        this.logger.error(
          `Re-screening failed for user ${userId}: ${error instanceof Error ? error.message : String(error)}`,
        );
        failed++;
      }
    }

    this.logger.log(
      `Re-screening complete: ${processed} processed, ${failed} failed`,
    );
    return { processed, failed };
  }

  async syncOfacList(): Promise<number> {
    return this.ofac.syncFromTreasury();
  }

  private resolveStatus(score: number): ScreeningStatus {
    if (score >= SCORE_BLOCK_THRESHOLD) return ScreeningStatus.BLOCKED;
    if (score >= SCORE_WARNING_THRESHOLD) return ScreeningStatus.WARNING;
    return ScreeningStatus.CLEAR;
  }

  private async recordAuditLog(payload: {
    actorId?: string;
    userId?: string;
    targetId?: string;
    action: string;
    entityId?: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    if (!this.auditLogsService) {
      return;
    }
    if (typeof this.auditLogsService.createLog === 'function') {
      await this.auditLogsService.createLog({
        actorId: payload.actorId,
        userId: payload.userId ?? payload.actorId,
        targetId: payload.targetId,
        action: payload.action,
        entity: AuditEntityType.USER,
        resourceType: 'KycScreening',
        entityId: payload.entityId,
        resourceId: payload.entityId,
        status: 'SUCCESS',
        metadata: payload.metadata,
      });
    } else if (typeof this.auditLogsService.log === 'function') {
      await this.auditLogsService.log(
        payload.actorId ?? null,
        payload.action,
        'KycScreening',
        payload.entityId ?? null,
        'SUCCESS',
        payload.metadata,
      );
    }
  }
}
