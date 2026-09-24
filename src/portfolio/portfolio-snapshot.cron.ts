import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PortfolioSnapshot } from './entities/portfolio-snapshot.entity';
import { PortfolioService } from './portfolio.service';

/**
 * Runs every day at midnight UTC, snapshots portfolio value for every user
 * that already has at least one portfolio snapshot (i.e. has opted in by
 * calling POST /v2/portfolio/value at least once). This keeps history up to
 * date without requiring every user to poll the endpoint.
 */
@Injectable()
export class PortfolioSnapshotCron {
  private readonly logger = new Logger(PortfolioSnapshotCron.name);

  constructor(
    @InjectRepository(PortfolioSnapshot)
    private readonly snapshotRepo: Repository<PortfolioSnapshot>,
    private readonly portfolioService: PortfolioService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async takeDailySnapshots(): Promise<void> {
    this.logger.log('Starting daily portfolio snapshot job...');

    // Find distinct user IDs that have at least one existing snapshot
    const rows = await this.snapshotRepo
      .createQueryBuilder('s')
      .select('DISTINCT s."userId"', 'userId')
      .getRawMany<{ userId: string }>();

    let successCount = 0;
    let failureCount = 0;

    for (const { userId } of rows) {
      try {
        await this.portfolioService.computeAndSnapshot(userId);
        successCount++;
      } catch (err: any) {
        failureCount++;
        this.logger.error(
          `Failed to snapshot portfolio for user ${userId}: ${err.message}`,
        );
      }
    }

    this.logger.log(
      `Daily portfolio snapshots complete — success: ${successCount}, failed: ${failureCount}`,
    );
  }
}
