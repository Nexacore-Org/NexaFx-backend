import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RateLocksService } from './rate-locks.service';

@Injectable()
export class RateLocksCron {
  private readonly logger = new Logger(RateLocksCron.name);

  constructor(private readonly rateLocksService: RateLocksService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleExpiredLocksCleanup() {
    const now = new Date();
    const deletedCount = await this.rateLocksService.cleanupExpiredLocks(now);

    if (deletedCount > 0) {
      this.logger.log(`Cleaned up ${deletedCount} expired rate lock(s).`);
    } else {
      this.logger.log(
        `No expired rate locks to clean up at ${now.toISOString()}.`,
      );
    }
  }
}
