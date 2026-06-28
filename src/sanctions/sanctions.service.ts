import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  KycScreening,
  ScreeningStatus,
  ScreeningProvider,
} from './entities/kyc-screening.entity';
import { KycRecord } from '../kyc/entities/kyc.entity';
import { OpenSanctionsProvider } from './providers/open-sanctions.provider';
import { OfacProvider } from './providers/ofac.provider';
import { WatchlistMatch } from './interfaces/watchlist-provider.interface';

const SCORE_WARNING_THRESHOLD = 30;
const SCORE_BLOCK_THRESHOLD = 70;

@Injectable()
export class SanctionsService {
  private readonly logger = new Logger(SanctionsService.name);

  constructor(
    @InjectRepository(KycScreening)
    private readonly screeningRepo: Repository<KycScreening>,
    @InjectRepository(KycRecord)
    private readonly kycRepo: Repository<KycRecord>,
    private readonly openSanctions: OpenSanctionsProvider,
    private readonly ofac: OfacProvider,
  ) {}

  async screenUser(userId: string): Promise<KycScreening> {
    const kyc = await this.kycRepo.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    const fullName = kyc?.fullName ?? userId;
    const dateOfBirth = kyc?.dateOfBirth
      ? kyc.dateOfBirth.toString().substring(0, 10)
      : undefined;
    const nationality = kyc?.nationality ?? undefined;

    const query = { fullName, dateOfBirth, nationality };

    let matches: WatchlistMatch[] = [];
    let provider = ScreeningProvider.OPEN_SANCTIONS;

    matches = await this.openSanctions.screen(query);

    if (matches.length === 0 && provider === ScreeningProvider.OPEN_SANCTIONS) {
      const fallbackMatches = await this.ofac.screen(query);
      if (fallbackMatches.length > 0 || matches.length === 0) {
        matches = fallbackMatches;
        provider = ScreeningProvider.OFAC;
      }
    }

    const topScore = matches.length > 0
      ? Math.max(...matches.map((m) => m.score))
      : 0;

    const status = this.resolveStatus(topScore);

    const screening = this.screeningRepo.create({
      userId,
      fullName,
      dateOfBirth: kyc?.dateOfBirth ?? null,
      nationality: nationality ?? null,
      score: topScore,
      status,
      provider,
      matches: matches as unknown as object[],
    });

    await this.screeningRepo.save(screening);

    this.logger.log(
      `Screened user ${userId}: score=${topScore} status=${status} provider=${provider}`,
    );

    return screening;
  }

  async getLatestScreening(userId: string): Promise<KycScreening | null> {
    return this.screeningRepo.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async listScreenings(
    status?: ScreeningStatus,
    page = 1,
    limit = 20,
  ): Promise<{ data: KycScreening[]; total: number }> {
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

    screening.status = ScreeningStatus.CLEAR;
    screening.overriddenBy = adminUserId;
    screening.overrideReason = reason;
    screening.overriddenAt = new Date();

    await this.screeningRepo.save(screening);

    this.logger.log(
      `Screening ${screeningId} overridden by ${adminUserId}: ${reason}`,
    );

    return screening;
  }

  async rescreenAllUsers(): Promise<{ processed: number; failed: number }> {
    this.logger.log('Starting monthly re-screening of all users');

    const kycs = await this.kycRepo
      .createQueryBuilder('k')
      .select(['k.userId'])
      .distinctOn(['k.userId'])
      .where('k.status = :status', { status: 'approved' })
      .getMany();

    let processed = 0;
    let failed = 0;

    for (const { userId } of kycs) {
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

    this.logger.log(`Re-screening complete: ${processed} processed, ${failed} failed`);
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
}
