import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PaymentRule, PaymentRuleTrigger, PaymentRuleAction } from './entities/payment-rule.entity';
import { WalletsService } from '../wallets/wallets.service';
import { TransactionsService } from '../transactions/services/transaction.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';

@Injectable()
export class ProgrammablePaymentRulesService {
  private readonly logger = new Logger(ProgrammablePaymentRulesService.name);
  private readonly COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes cooldown to prevent infinite execution loops

  constructor(
    @InjectRepository(PaymentRule)
    private readonly ruleRepository: Repository<PaymentRule>,
    private readonly walletsService: WalletsService,
    private readonly transactionsService: TransactionsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ─── Scheduled Evaluation ─────────────────────────────────────────────────

  @Cron(CronExpression.EVERY_MINUTE)
  async evaluateAll(): Promise<void> {
    this.logger.log('Evaluating payment rules...');
    const activeRules = await this.ruleRepository.find({ where: { isActive: true } });

    for (const rule of activeRules) {
      try {
        await this.evaluateRule(rule);
      } catch (err: any) {
        this.logger.error(`Error evaluating rule ${rule.id} for user ${rule.userId}: ${err.message}`);
      }
    }
  }

  async evaluateRule(rule: PaymentRule): Promise<void> {
    // Check cooldown safety boundary
    if (rule.lastTriggeredAt && (Date.now() - rule.lastTriggeredAt.getTime() < this.COOLDOWN_MS)) {
      return;
    }

    const { currency, threshold } = rule.triggerCondition;
    
    // Fetch user's wallets to check balance
    const wallets = await this.walletsService.findAllByUser(rule.userId);
    const wallet = wallets.find((w) => w.currency.toUpperCase() === currency.toUpperCase());
    const currentBalance = wallet ? parseFloat(wallet.balance) : 0;

    let triggerConditionMet = false;
    if (rule.triggerType === PaymentRuleTrigger.BALANCE_BELOW) {
      triggerConditionMet = currentBalance < threshold;
    } else if (rule.triggerType === PaymentRuleTrigger.BALANCE_ABOVE) {
      triggerConditionMet = currentBalance > threshold;
    }

    // Update evaluation timestamp
    rule.lastEvaluatedAt = new Date();
    await this.ruleRepository.save(rule);

    if (triggerConditionMet) {
      this.logger.log(`Rule ${rule.id} (${rule.name}) triggered for user ${rule.userId}`);
      await this.dispatchAction(rule);
      
      rule.lastTriggeredAt = new Date();
      await this.ruleRepository.save(rule);
    }
  }

  private async dispatchAction(rule: PaymentRule): Promise<void> {
    if (rule.actionType === PaymentRuleAction.SEND_NOTIFICATION) {
      const message = rule.actionParameters.message || `Your balance for ${rule.triggerCondition.currency} has crossed the threshold.`;
      await this.notificationsService.dispatch(
        rule.userId,
        NotificationType.SYSTEM,
        'Payment Rule Alert',
        message,
        { ruleId: rule.id },
      );
    } else if (rule.actionType === PaymentRuleAction.SWAP) {
      const { fromCurrency, toCurrency, amount } = rule.actionParameters;
      if (!fromCurrency || !toCurrency || !amount) {
        throw new Error('SWAP action requires fromCurrency, toCurrency, and amount parameters');
      }

      // Find the source wallet to get public key/address
      const fromWallet = await this.walletsService.findByUserAndCurrency(rule.userId, fromCurrency);
      if (!fromWallet || !fromWallet.publicKey) {
        throw new Error(`No wallet or public key found for source currency ${fromCurrency}`);
      }

      await this.transactionsService.createSwap(rule.userId, {
        amount,
        fromCurrency,
        toCurrency,
        sourceAddress: fromWallet.publicKey,
        walletId: fromWallet.id,
      });
      this.logger.log(`Auto-swap executed successfully for rule ${rule.id}`);
    }
  }

  // ─── CRUD Endpoints ───────────────────────────────────────────────────────

  async create(userId: string, dto: Partial<PaymentRule>): Promise<PaymentRule> {
    const rule = this.ruleRepository.create({ ...dto, userId });
    return this.ruleRepository.save(rule);
  }

  async findAll(userId: string): Promise<PaymentRule[]> {
    return this.ruleRepository.find({ where: { userId } });
  }

  async findOne(userId: string, id: string): Promise<PaymentRule> {
    const rule = await this.ruleRepository.findOne({ where: { id } });
    if (!rule) throw new NotFoundException('Payment rule not found');
    if (rule.userId !== userId) throw new ForbiddenException('You do not own this rule');
    return rule;
  }

  async update(userId: string, id: string, dto: Partial<PaymentRule>): Promise<PaymentRule> {
    const rule = await this.findOne(userId, id);
    Object.assign(rule, dto);
    return this.ruleRepository.save(rule);
  }

  async delete(userId: string, id: string): Promise<void> {
    const rule = await this.findOne(userId, id);
    await this.ruleRepository.remove(rule);
  }
}
