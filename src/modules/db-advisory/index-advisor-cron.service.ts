import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { IndexAdvisorService } from './index-advisor.service';

@Injectable()
export class IndexAdvisorCronService {
  private readonly logger = new Logger(IndexAdvisorCronService.name);
  private isRunning = false;

  constructor(private readonly indexAdvisorService: IndexAdvisorService) {}

  @Cron('0 4 * * 0', { timeZone: 'UTC' })
  async handleWeeklyAnalysis() {
    if (this.isRunning) {
      this.logger.warn('Weekly index advisory analysis already running — skipping');
      return;
    }

    this.isRunning = true;
    this.logger.log('Starting weekly database index advisory analysis');

    try {
      const report = await this.indexAdvisorService.analyse();
      this.logger.log(
        `Weekly analysis complete: ${report.missingIndexes.length} missing, ` +
          `${report.unusedIndexes.length} unused, ${report.slowQueries.length} slow queries`,
      );
    } catch (error: unknown) {
      this.logger.error(
        `Weekly index advisory analysis failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.isRunning = false;
    }
  }
}
