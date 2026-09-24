import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConditionalPayment, ConditionalPaymentStatus, ConditionType } from './entities/conditional-payment.entity';
import { TransactionsService } from '../transactions/transactions.service'; // Adjust path

@Injectable()
export class ConditionalPaymentFlowsService {
  private readonly logger = new Logger(ConditionalPaymentFlowsService.name);

  constructor(
    @InjectRepository(ConditionalPayment)
    private readonly paymentRepo: Repository<ConditionalPayment>,
    private readonly transactionsService: TransactionsService,
  ) {}

  async create(userId: string, dto: { conditionType: ConditionType; conditionParams: Record<string, any>; actionParams: Record<string, any>; expiresAt?: string }): Promise<ConditionalPayment> {
    const payment = this.paymentRepo.create({
      userId,
      conditionType: dto.conditionType,
      conditionParams: dto.conditionParams,
      actionParams: dto.actionParams,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
    });
    return await this.paymentRepo.save(payment);
  }

  async cancel(id: string, userId: string): Promise<ConditionalPayment> {
    const payment = await this.paymentRepo.findOne({ where: { id, userId } });
    if (!payment) {
      throw new NotFoundException('Conditional payment not found');
    }
    payment.status = ConditionalPaymentStatus.CANCELLED;
    return await this.paymentRepo.save(payment);
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async evaluatePendingPayments(): Promise<void> {
    this.logger.debug('Evaluating pending conditional payments...');
    const pendingPayments = await this.paymentRepo.find({
      where: { status: ConditionalPaymentStatus.PENDING },
    });

    const now = new Date();

    for (const payment of pendingPayments) {
      // Check expiration
      if (payment.expiresAt && payment.expiresAt < now) {
        payment.status = ConditionalPaymentStatus.EXPIRED;
        await this.paymentRepo.save(payment);
        continue;
      }

      try {
        const met = await this.evaluateCondition(payment);
        if (met) {
          // Execute underlying transaction via TransactionsService
          await this.transactionsService.create(payment.userId, payment.actionParams);
          payment.status = ConditionalPaymentStatus.TRIGGERED;
          await this.paymentRepo.save(payment);
          this.logger.log(`Conditional payment ${payment.id} successfully triggered and executed.`);
        }
      } catch (err) {
        this.logger.error(`Failed to evaluate/execute conditional payment ${payment.id}: ${err.message}`);
      }
    }
  }

  private async evaluateCondition(payment: ConditionalPayment): Promise<boolean> {
    const { conditionType, conditionParams } = payment;

    switch (conditionType) {
      case ConditionType.SCHEDULED_DATE:
        return new Date(conditionParams.targetDate) <= new Date();

      case ConditionType.RATE_THRESHOLD:
        // Hook into existing rate service logic or mock comparison
        // e.g. currentRate >= conditionParams.threshold
        return false; 

      case ConditionType.RECIPIENT_KYC_TIER:
        // Hook into KYC verification service
        return conditionParams.requiredTier === 'FULL';

      default:
        return false;
    }
  }
}