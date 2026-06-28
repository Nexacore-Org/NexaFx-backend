import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { FiatDeposit, FiatDepositStatus } from './entities/fiat-deposit.entity';
import { FiatWithdrawal, FiatWithdrawalStatus } from './entities/fiat-withdrawal.entity';
import { User } from '../../users/user.entity';
import { Wallet } from '../../wallets/entities/wallet.entity';
import { KycRecord, KycStatus } from '../../kyc/entities/kyc.entity';
import { FiatRampProvider } from './providers/fiat-ramp-provider.interface';
import { FlutterwaveProvider } from './providers/flutterwave.provider';
import { CreateDepositDto, CreateWithdrawalDto, VerifyBankAccountDto } from './dto/fiat.dto';
import { NotificationsService } from '../../notifications/notifications.service';
import { NotificationType, NotificationStatus } from '../../notifications/entities/notification.entity';
import Decimal from 'decimal.js';

@Injectable()
export class FiatService {
  private readonly logger = new Logger(FiatService.name);
  private readonly provider: FiatRampProvider;

  constructor(
    @InjectRepository(FiatDeposit)
    private readonly depositRepository: Repository<FiatDeposit>,
    @InjectRepository(FiatWithdrawal)
    private readonly withdrawalRepository: Repository<FiatWithdrawal>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    @InjectRepository(KycRecord)
    private readonly kycRepository: Repository<KycRecord>,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    private readonly notificationsService: NotificationsService,
  ) {
    const providerType = this.configService.get<string>('FIAT_RAMP_PROVIDER', 'flutterwave');
    
    if (providerType === 'flutterwave') {
      this.provider = new FlutterwaveProvider(this.configService);
    } else {
      throw new Error(`Unsupported fiat ramp provider: ${providerType}`);
    }
  }

  async initiateDeposit(userId: string, dto: CreateDepositDto) {
    return this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(User, { where: { id: userId } });
      if (!user) {
        throw new NotFoundException('User not found');
      }

      const result = await this.provider.initiateDeposit(userId, dto.amount, dto.currency);

      const deposit = manager.create(FiatDeposit, {
        userId,
        reference: result.reference,
        amount: dto.amount.toFixed(8),
        currency: dto.currency,
        status: FiatDepositStatus.PENDING,
        paymentLink: result.paymentLink,
        expiresAt: result.expiresAt,
      });

      await manager.save(deposit);

      return {
        reference: deposit.reference,
        paymentLink: deposit.paymentLink,
        expiresAt: deposit.expiresAt,
        amount: deposit.amount,
        currency: deposit.currency,
      };
    });
  }

  async getDeposits(userId: string) {
    const deposits = await this.depositRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    return deposits.map((deposit) => ({
      id: deposit.id,
      reference: deposit.reference,
      amount: deposit.amount,
      currency: deposit.currency,
      status: deposit.status,
      paymentLink: deposit.paymentLink,
      expiresAt: deposit.expiresAt,
      walletCreditedAt: deposit.walletCreditedAt,
      failureReason: deposit.failureReason,
      createdAt: deposit.createdAt,
      updatedAt: deposit.updatedAt,
    }));
  }

  async initiateWithdrawal(userId: string, dto: CreateWithdrawalDto) {
    return this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(User, { where: { id: userId } });
      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Check KYC status
      const latestKyc = await manager.findOne(KycRecord, {
        where: { userId },
        order: { createdAt: 'DESC' },
      });

      if (!latestKyc || latestKyc.status !== KycStatus.APPROVED) {
        throw new ForbiddenException('KYC approval required for withdrawals');
      }

      // Check wallet balance
      const wallet = await manager.findOne(Wallet, {
        where: { userId, currency: dto.currency },
      });

      if (!wallet) {
        throw new NotFoundException('Wallet not found for this currency');
      }

      const currentBalance = new Decimal(wallet.balance);
      const withdrawalAmount = new Decimal(dto.amount);

      if (currentBalance.lessThan(withdrawalAmount)) {
        throw new BadRequestException('Insufficient wallet balance');
      }

      // Verify bank account
      const bankVerification = await this.provider.verifyBankAccount(
        dto.bankCode,
        dto.accountNumber,
      );

      const result = await this.provider.initiateWithdrawal(
        userId,
        dto.amount,
        dto.currency,
        {
          bankCode: dto.bankCode,
          accountNumber: dto.accountNumber,
          accountName: bankVerification.accountName,
        },
      );

      const withdrawal = manager.create(FiatWithdrawal, {
        userId,
        reference: result.reference,
        amount: dto.amount.toFixed(8),
        currency: dto.currency,
        bankCode: dto.bankCode,
        accountNumber: dto.accountNumber,
        accountName: bankVerification.accountName,
        status: FiatWithdrawalStatus.PROCESSING,
        providerReference: result.reference,
      });

      await manager.save(withdrawal);

      // Deduct from wallet
      const newBalance = currentBalance.minus(withdrawalAmount);
      wallet.balance = newBalance.toFixed(8);
      await manager.save(wallet);

      return {
        reference: withdrawal.reference,
        amount: withdrawal.amount,
        currency: withdrawal.currency,
        bankCode: withdrawal.bankCode,
        accountNumber: withdrawal.accountNumber,
        accountName: withdrawal.accountName,
        status: withdrawal.status,
        estimatedArrival: result.estimatedArrival,
      };
    });
  }

  async getWithdrawals(userId: string) {
    const withdrawals = await this.withdrawalRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    return withdrawals.map((withdrawal) => ({
      id: withdrawal.id,
      reference: withdrawal.reference,
      amount: withdrawal.amount,
      currency: withdrawal.currency,
      bankCode: withdrawal.bankCode,
      accountNumber: withdrawal.accountNumber,
      accountName: withdrawal.accountName,
      status: withdrawal.status,
      providerReference: withdrawal.providerReference,
      failureReason: withdrawal.failureReason,
      processedAt: withdrawal.processedAt,
      createdAt: withdrawal.createdAt,
      updatedAt: withdrawal.updatedAt,
    }));
  }

  async verifyBankAccount(dto: VerifyBankAccountDto) {
    const verification = await this.provider.verifyBankAccount(
      dto.bankCode,
      dto.accountNumber,
    );

    return {
      accountName: verification.accountName,
    };
  }

  async processDepositWebhook(payload: any, signature: string) {
    const secret = this.configService.get<string>('FLUTTERWAVE_SECRET_HASH');
    
    if (!this.provider.verifyWebhookSignature(payload, signature, secret)) {
      throw new ForbiddenException('Invalid webhook signature');
    }

    const eventType = payload.event;
    const reference = payload.data.tx_ref || payload.data.reference;

    if (!reference) {
      this.logger.warn('Webhook payload missing reference');
      return { success: false, message: 'Missing reference' };
    }

    // Idempotency check
    const existingDeposit = await this.depositRepository.findOne({
      where: { reference },
    });

    if (!existingDeposit) {
      this.logger.warn(`Deposit not found for reference: ${reference}`);
      return { success: false, message: 'Deposit not found' };
    }

    if (existingDeposit.status === FiatDepositStatus.COMPLETED) {
      this.logger.log(`Deposit already completed: ${reference}`);
      return { success: true, message: 'Already processed' };
    }

    return this.dataSource.transaction(async (manager) => {
      const deposit = await manager.findOne(FiatDeposit, {
        where: { reference },
      });

      if (!deposit) {
        throw new NotFoundException('Deposit not found');
      }

      if (eventType === 'payment.completed' || payload.data.status === 'successful') {
        // Credit user wallet
        const wallet = await manager.findOne(Wallet, {
          where: { userId: deposit.userId, currency: deposit.currency },
        });

        if (wallet) {
          const currentBalance = new Decimal(wallet.balance);
          const depositAmount = new Decimal(deposit.amount);
          const newBalance = currentBalance.plus(depositAmount);
          wallet.balance = newBalance.toFixed(8);
          await manager.save(wallet);
        }

        // Update deposit status
        deposit.status = FiatDepositStatus.COMPLETED;
        deposit.walletCreditedAt = new Date();
        deposit.providerReference = payload.data.flw_ref || payload.data.id;
        await manager.save(deposit);

        // Send notification
        await this.notificationsService.create({
          userId: deposit.userId,
          type: NotificationType.TRANSACTION,
          title: 'Deposit Completed',
          message: `Your deposit of ${deposit.amount} ${deposit.currency} has been credited to your wallet.`,
          status: NotificationStatus.UNREAD,
          relatedId: deposit.id,
          metadata: {
            entity: 'FIAT_DEPOSIT',
            reference: deposit.reference,
            amount: deposit.amount,
            currency: deposit.currency,
          },
        });

        this.logger.log(`Deposit completed: ${reference}`);
      } else if (payload.data.status === 'failed' || eventType === 'payment.failed') {
        deposit.status = FiatDepositStatus.FAILED;
        deposit.failureReason = payload.data.processor_response || 'Payment failed';
        await manager.save(deposit);

        await this.notificationsService.create({
          userId: deposit.userId,
          type: NotificationType.TRANSACTION,
          title: 'Deposit Failed',
          message: `Your deposit of ${deposit.amount} ${deposit.currency} failed. ${deposit.failureReason}`,
          status: NotificationStatus.UNREAD,
          relatedId: deposit.id,
          metadata: {
            entity: 'FIAT_DEPOSIT',
            reference: deposit.reference,
            amount: deposit.amount,
            currency: deposit.currency,
          },
        });

        this.logger.log(`Deposit failed: ${reference}`);
      }

      return { success: true, message: 'Webhook processed' };
    });
  }

  async processWithdrawalWebhook(payload: any, signature: string) {
    const secret = this.configService.get<string>('FLUTTERWAVE_SECRET_HASH');
    
    if (!this.provider.verifyWebhookSignature(payload, signature, secret)) {
      throw new ForbiddenException('Invalid webhook signature');
    }

    const eventType = payload.event;
    const reference = payload.data.reference;

    if (!reference) {
      this.logger.warn('Webhook payload missing reference');
      return { success: false, message: 'Missing reference' };
    }

    // Idempotency check
    const existingWithdrawal = await this.withdrawalRepository.findOne({
      where: { reference },
    });

    if (!existingWithdrawal) {
      this.logger.warn(`Withdrawal not found for reference: ${reference}`);
      return { success: false, message: 'Withdrawal not found' };
    }

    if (existingWithdrawal.status === FiatWithdrawalStatus.COMPLETED) {
      this.logger.log(`Withdrawal already completed: ${reference}`);
      return { success: true, message: 'Already processed' };
    }

    return this.dataSource.transaction(async (manager) => {
      const withdrawal = await manager.findOne(FiatWithdrawal, {
        where: { reference },
      });

      if (!withdrawal) {
        throw new NotFoundException('Withdrawal not found');
      }

      if (eventType === 'transfer.completed' || payload.data.status === 'successful') {
        withdrawal.status = FiatWithdrawalStatus.COMPLETED;
        withdrawal.processedAt = new Date();
        await manager.save(withdrawal);

        await this.notificationsService.create({
          userId: withdrawal.userId,
          type: NotificationType.TRANSACTION,
          title: 'Withdrawal Completed',
          message: `Your withdrawal of ${withdrawal.amount} ${withdrawal.currency} has been successfully sent to your bank account.`,
          status: NotificationStatus.UNREAD,
          relatedId: withdrawal.id,
          metadata: {
            entity: 'FIAT_WITHDRAWAL',
            reference: withdrawal.reference,
            amount: withdrawal.amount,
            currency: withdrawal.currency,
          },
        });

        this.logger.log(`Withdrawal completed: ${reference}`);
      } else if (payload.data.status === 'failed' || eventType === 'transfer.failed') {
        withdrawal.status = FiatWithdrawalStatus.FAILED;
        withdrawal.failureReason = payload.data.processor_response || 'Transfer failed';
        withdrawal.processedAt = new Date();
        await manager.save(withdrawal);

        // Refund the amount back to wallet
        const wallet = await manager.findOne(Wallet, {
          where: { userId: withdrawal.userId, currency: withdrawal.currency },
        });

        if (wallet) {
          const currentBalance = new Decimal(wallet.balance);
          const refundAmount = new Decimal(withdrawal.amount);
          const newBalance = currentBalance.plus(refundAmount);
          wallet.balance = newBalance.toFixed(8);
          await manager.save(wallet);
        }

        await this.notificationsService.create({
          userId: withdrawal.userId,
          type: NotificationType.TRANSACTION,
          title: 'Withdrawal Failed',
          message: `Your withdrawal of ${withdrawal.amount} ${withdrawal.currency} failed. The amount has been refunded to your wallet. ${withdrawal.failureReason}`,
          status: NotificationStatus.UNREAD,
          relatedId: withdrawal.id,
          metadata: {
            entity: 'FIAT_WITHDRAWAL',
            reference: withdrawal.reference,
            amount: withdrawal.amount,
            currency: withdrawal.currency,
          },
        });

        this.logger.log(`Withdrawal failed and refunded: ${reference}`);
      }

      return { success: true, message: 'Webhook processed' };
    });
  }
}
