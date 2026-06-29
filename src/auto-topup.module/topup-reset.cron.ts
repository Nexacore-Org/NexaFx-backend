import { Injectable, Logger } from '@nestjs/schedule';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AutoTopupRule } from '../entities/auto-topup-rule.entity';

@Injectable()
export class TopupResetCron {
  private readonly logger = new Logger(TopupResetCron.name);

  constructor(
    @InjectRepository(AutoTopupRule)
    private readonly ruleRepo: Repository<AutoTopupRule>,
  ) {}

  @Cron('0 0 * * *') // Triggers daily execution sweeps precisely at midnight (00:00 UTC)
  async resetDailyVelocityCounters() {
    this.logger.log('Starting midnight UTC wallet automation velocity reset sequence...');
    
    // Clear usage limits globally for the new calendar operational cycle window
    await this.ruleRepo.update({}, { topupCount: 0 });
    
    this.logger.log('Velocity counters reset to 0 successfully.');
  }
}