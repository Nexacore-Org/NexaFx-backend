import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { InjectRepository } from '@nestjs/typeorm';
import { Transaction } from '../../transactions/entities/transaction.entity';
import { User } from '../../user/entities/user.entity';
import { Currency } from '../../currencies/entities/currency.entity';
import { NotificationsService } from '../../notifications/providers/notifications.service';
import { CreateWithdrawalDto } from '../dto/create-withdraw.dto';
import { WithdrawalResponseDto } from '../dto/withdrawal-response.dto';
import { TransactionType } from '../../transactions/enums/transaction-type.enum';
import { TransactionStatus } from 'src/transactions/enums/transaction-status.enum';
import { WithdrawalMethod } from '../enums/withdrawalMethod.enum';
import { NotificationType } from 'src/notifications/enum/notificationType.enum';
import { NotificationChannel } from 'src/notifications/enum/notificationChannel.enum';

@Injectable()
export class WithdrawService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectRepository(Currency)
    private readonly currencyRepository: Repository<Currency>,
    private readonly notificationsService: NotificationsService,
  ) {}

  async createWithdrawal(
    userId: string,
    createWithdrawalDto: CreateWithdrawalDto,
  ): Promise<WithdrawalResponseDto> {
    const { currency, amount, destination, method, description } =
      createWithdrawalDto;

    // Validate amount
    if (amount <= 0) {
      throw new BadRequestException(
        'Invalid amount: Amount must be greater than 0',
      );
    }

    // Get user
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Get currency
    const currencyEntity = await this.currencyRepository.findOne({
      where: { code: currency.toUpperCase() },
    });

    if (!currencyEntity) {
      throw new BadRequestException(`Currency ${currency} not supported`);
    }

    // Check user balance (this would typically come from a wallet/balance service)
    const userBalance = await this.getUserBalance(userId, currency);

    // Calculate fee (0% as shown in Figma)
    const feeAmount = 0;
    const totalAmount = amount + feeAmount;

    if (userBalance < totalAmount) {
      throw new BadRequestException(
        `Insufficient balance. Available: ${userBalance} ${currency}, Required: ${totalAmount} ${currency}`,
      );
    }

    // Generate unique reference
    const reference = this.generateWithdrawalReference();

    // Create withdrawal transaction
    const withdrawal = this.transactionRepository.create({
      id: uuidv4(),
      initiatorId: userId,
      initiator: user,
      type: TransactionType.WITHDRAWAL,
      amount,
      currency: currencyEntity,
      currencyId: currencyEntity.id,
      status: TransactionStatus.PENDING,
      reference,
      description:
        description ||
        `Withdrawal to ${method === WithdrawalMethod.WALLET ? 'wallet' : 'fiat'}`,
      destinationAccount: destination,
      totalAmount,
      feeAmount,
      feeCurrency: currencyEntity,
      feeCurrencyId: currencyEntity.id,
      asset: currency.toUpperCase(),
      metadata: {
        method,
        destination,
        withdrawalType: method === WithdrawalMethod.WALLET ? 'crypto' : 'fiat',
      },
    });

    const savedWithdrawal = await this.transactionRepository.save(withdrawal);

    // Send notification
    await this.sendWithdrawalNotification(user, savedWithdrawal);

    return this.mapToResponseDto(savedWithdrawal);
  }

  async getWithdrawalHistory(
    userId: string,
    page = 1,
    limit = 10,
  ): Promise<{
    withdrawals: WithdrawalResponseDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    const [withdrawals, total] = await this.transactionRepository.findAndCount({
      where: {
        initiatorId: userId,
        type: TransactionType.WITHDRAWAL,
      },
      relations: ['currency', 'feeCurrency'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      withdrawals: withdrawals.map((withdrawal) =>
        this.mapToResponseDto(withdrawal),
      ),
      total,
      page,
      limit,
    };
  }

  async getWithdrawalById(
    id: string,
    userId: string,
  ): Promise<WithdrawalResponseDto> {
    const withdrawal = await this.transactionRepository.findOne({
      where: {
        id,
        initiatorId: userId,
        type: TransactionType.WITHDRAWAL,
      },
      relations: ['currency', 'feeCurrency'],
    });

    if (!withdrawal) {
      throw new NotFoundException('Withdrawal not found');
    }

    return this.mapToResponseDto(withdrawal);
  }

  private async getUserBalance(
    userId: string,
    currency: string,
  ): Promise<number> {
    // This is a mock implementation. In a real application, you would:
    // 1. Query a wallet/balance service
    // 2. Calculate balance from transaction history
    // 3. Check with blockchain service for actual balance

    // For demo purposes, returning a mock balance
    const mockBalances: Record<string, number> = {
      USDC: 326447,
      NGN: 1000000,
      USD: 5000,
      BTC: 0.5,
      ETH: 2.5,
    };

    return mockBalances[currency.toUpperCase()] || 0;
  }

  private generateWithdrawalReference(): string {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `WD-${dateStr}-${randomStr}`;
  }

  private async sendWithdrawalNotification(
    user: User,
    withdrawal: Transaction,
  ): Promise<void> {
    try {
      // Check if the notifications service has the correct method
      if (typeof this.notificationsService.create === 'function') {
        await this.notificationsService.create({
          userId: user.id,
          type: NotificationType.TRANSACTION,
          channel: NotificationChannel.IN_APP,
          title: 'Withdrawal Request Submitted',
          message: `Your withdrawal request for ${withdrawal.amount} ${withdrawal.asset} has been submitted and is pending review.`,
          metadata: {
            transactionId: withdrawal.id,
            reference: withdrawal.reference,
            amount: withdrawal.amount,
            currency: withdrawal.asset,
          },
        });

        // Also send email notification if email channel is available
        await this.notificationsService.create({
          userId: user.id,
          type: NotificationType.TRANSACTION,
          channel: NotificationChannel.EMAIL,
          title: 'Withdrawal Request Submitted',
          message: `Your withdrawal request for ${withdrawal.amount} ${withdrawal.asset} has been submitted and is pending review. Reference: ${withdrawal.reference}`,
          metadata: {
            transactionId: withdrawal.id,
            reference: withdrawal.reference,
            amount: withdrawal.amount,
            currency: withdrawal.asset,
          },
        });
      }
    } catch (error) {
      // Log error but don't fail the withdrawal process
      console.error('Failed to send withdrawal notification:', error);
    }
  }

  private mapToResponseDto(transaction: Transaction): WithdrawalResponseDto {
    return {
      id: transaction.id,
      reference: transaction.reference,
      amount: transaction.amount,
      currency: transaction.asset,
      destination: transaction.destinationAccount || '',
      status: transaction.status,
      feeAmount: transaction.feeAmount || 0,
      totalAmount: transaction.totalAmount || transaction.amount,
      createdAt: transaction.createdAt,
    };
  }
}
