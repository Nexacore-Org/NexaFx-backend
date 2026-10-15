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
import { User, UserKycTier } from '../users/user.entity';
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
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly openSanctions: OpenSanctionsProvider,
    private readonly ofac: OfacProvider,
  ) {}

  async screenUser(userId: string): Promise<KycScreening> {
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

    const screening = this.screeningRepo.create({
      userId,
      fullName,
      dateOfBirth: null,
      nationality: null,
      score: topScore,
      status,
      provider,
      matches: matches as unknown as object[],
    });

    await this.screeningRepo.save(screening);

    this.logger.log(
      `Screened user ${userId}: score=${topScore} status=${status} provider=${provider} failed=${providerFailed}`,
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
}
