import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { StatementService } from './statement.service';

@Injectable()
export class StatementCronService {
  private readonly logger = new Logger(StatementCronService.name);
  private isRunning = false;

  constructor(private readonly statementService: StatementService) {}

  @Cron('0 5 1 * *', { timeZone: 'UTC' })
  async handleMonthlyStatementGeneration() {
    if (this.isRunning) {
      this.logger.warn('Monthly statement generation already running — skipping');
      return;
    }

    this.isRunning = true;

    const now = new Date();
    const previousMonth = now.getMonth() === 0 ? 12 : now.getMonth();
    const previousYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

    this.logger.log(
      `Generating statements for ${previousYear}-${previousMonth}`,
    );

    try {
      await this.statementService.generateForAllActiveUsers(
        previousYear,
        previousMonth,
      );
      this.logger.log('Monthly statement generation complete');
    } catch (error: unknown) {
      this.logger.error(
        `Monthly statement generation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.isRunning = false;
    }
  }
}
