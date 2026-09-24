import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  RebalancingPolicy,
  RebalanceFrequency,
} from '../rebalancing/entities/rebalancing-policy.entity';
import { RebalancingService } from '../rebalancing/rebalancing.service';

@Injectable()
export class PortfolioCronService {
  private readonly logger = new Logger(PortfolioCronService.name);

  constructor(
    @InjectRepository(RebalancingPolicy)
    private readonly policyRepo: Repository<RebalancingPolicy>,
    private readonly rebalancingService: RebalancingService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleScheduledRebalancing() {
    this.logger.log('Running automated portfolio rebalancing cron job...');

    const activePolicies = await this.policyRepo.find({
      where: { isActive: true },
    });

    const now = new Date();

    for (const policy of activePolicies) {
      if (policy.frequency === RebalanceFrequency.MANUAL) continue;

      const lastRun = policy.lastRebalancedAt
        ? new Date(policy.lastRebalancedAt)
        : new Date(0);
      const diffDays =
        (now.getTime() - lastRun.getTime()) / (1000 * 3600 * 24);

      const isWeeklyDue =
        policy.frequency === RebalanceFrequency.WEEKLY && diffDays >= 7;
      const isMonthlyDue =
        policy.frequency === RebalanceFrequency.MONTHLY && diffDays >= 30;

      if (isWeeklyDue || isMonthlyDue) {
        try {
          const drift = await this.rebalancingService.checkDrift(
            policy.userId,
          );
          if (drift.needsRebalancing) {
            await this.rebalancingService.execute(policy.userId);
            this.logger.log(
              `Successfully auto-rebalanced user ${policy.userId}`,
            );
          }
        } catch (err: any) {
          this.logger.error(
            `Failed auto-rebalance for user ${policy.userId}: ${err.message}`,
          );
        }
      }
    }
  }
}