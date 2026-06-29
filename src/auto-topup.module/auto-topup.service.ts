import { Injectable, BadRequestException, UnprocessableEntityException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AutoTopupRule } from '../entities/auto-topup-rule.entity';
import { AutoTopupEvent } from '../entities/auto-topup-event.entity';
import { ConversionsService } from '../../conversion/conversions.service'; // Path to your conversion engine
import { EmailService } from '../../auth/email.service';

@Injectable()
export class AutoTopupService {
  constructor(
    @InjectRepository(AutoTopupRule)
    private readonly ruleRepo: Repository<AutoTopupRule>,
    @InjectRepository(AutoTopupEvent)
    private readonly eventRepo: Repository<AutoTopupEvent>,
    private readonly conversionsService: ConversionsService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Evaluates and registers new automation profiles guarded against structural loop vulnerabilities.
   */
  async createRule(userId: string, dto: any): Promise<AutoTopupRule> {
    const source = dto.sourceCurrency.toUpperCase().trim();
    const target = dto.targetCurrency.toUpperCase().trim();

    // Safeguard 1: Identity mapping checks
    if (source === target) {
      throw new BadRequestException('Source and target currency parameters cannot be identical.');
    }

    // Safeguard 2: Absolute rule limit capacity bounds per account profile
    const existingRulesCount = await this.ruleRepo.count({ where: { userId } });
    if (existingRulesCount >= 5) {
      throw new UnprocessableEntityException('Rule matrix full. Maximum cap limit is 5 configuration rules per user.');
    }

    // Safeguard 3: Circular Rule Short-circuiting Matrix Execution (e.g., A -> B and B -> A)
    const circularMatch = await this.ruleRepo.findOne({
      where: {
        userId,
        sourceCurrency: target,
        targetCurrency: source,
        isActive: true,
      },
    });
    if (circularMatch) {
      throw new UnprocessableEntityException('Circular loop detected. This setup would cause infinite back-and-forth automated conversions.');
    }

    const rule = this.ruleRepo.create({
      ...dto,
      userId,
      sourceCurrency: source,
      targetCurrency: target,
    });
    return await this.ruleRepo.save(rule);
  }

  /**
   * Non-Blocking Hook Interceptor triggered after wallet adjustments.
   * Assures original core balance modifications never face execution thread lag loops.
   */
  async handlePostDebitCheckAsync(userId: string, currency: string, currentBalance: number): Promise<void> {
    // Run asynchronously outside the main execution thread line
    setImmediate(async () => {
      try {
        const rule = await this.ruleRepo.findOne({
          where: { userId, targetCurrency: currency, isActive: true },
        });

        if (!rule) return;

        // Condition check: Evaluate active target execution boundary rules
        if (Number(currentBalance) >= Number(rule.triggerBalanceThreshold)) return;
        if (rule.topupCount >= rule.maxTopupsPerDay) {
          await this._logEvent(rule.id, 'VELOCITY_LIMIT_BREACHED', 'Daily velocity configuration cap limits breached.');
          return;
        }

        // Trigger safe out-of-band balance conversion adjustments via the internal conversion engine
        try {
          await this.conversionsService.executeInternalWalletConversion({
            userId,
            fromCurrency: rule.sourceCurrency,
            toCurrency: rule.targetCurrency,
            amount: rule.topupAmount,
          });

          // Increment rule counters upon a verified transaction completion match
          rule.topupCount += 1;
          rule.lastTopupAt = new Date();
          await this.ruleRepo.save(rule);

          await this._logEvent(rule.id, 'SUCCESS', null, rule.topupAmount);
          
          // Dispatch notifications
          await this.emailService.sendMail(
            userId, // Resolved dynamically or via lookup
            `Auto-Topup Succeeded: ${rule.targetCurrency}`,
            `<p>Your balance fell below threshold metrics. Successfully top-up funded with ${rule.topupAmount} ${rule.targetCurrency}.</p>`
          );

        } catch (conversionErr) {
          // Fallback Strategy: Capture insufficient source balances elegantly without crashing core modules
          const errMsg = conversionErr.message || 'Conversion execution tracking rejected.';
          await this._logEvent(rule.id, 'FAILED_INSUFFICIENT_FUNDS', errMsg);
          
          await this.emailService.sendMail(
            userId,
            `Auto-Topup Failed: ${rule.targetCurrency}`,
            `<p>Attempted auto-topup failed due to source constraints: <b>${errMsg}</b>. Please check your funds.</p>`
          );
        }

      } catch (err) {
        // Suppress errors locally to keep parent threads isolated and healthy
        // logger.error("Background auto-topup pipeline error intercept", err);
      }
    });
  }

  private async _logEvent(ruleId: string, status: any, error: string = null, amount: number = null) {
    const event = this.eventRepo.create({ ruleId, status, errorMessage: error, executedAmount: amount });
    await this.eventRepo.save(event);
  }
}