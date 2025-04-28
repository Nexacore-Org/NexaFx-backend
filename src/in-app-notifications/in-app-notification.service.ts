import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { InAppNotification } from './in-app-notification.entity';
import { EmailService } from './email.service';
import { In } from 'typeorm';
import { NotificationChannel } from './enums/notificationChannel.enum';
import { NotificationType } from './enums/notificationType.enum';

export interface NotificationPayload {
  userId: string;
  type: NotificationType;
  title: string;
  content: string;
  channel?: NotificationChannel;
  metadata?: Record<string, any>;
}

export interface SwapCompletedEvent {
  userId: string;
  swapId: string;
  fromAsset: string;
  toAsset: string;
  fromAmount: number;
  toAmount: number;
  timestamp: Date;
}

export interface WalletUpdatedEvent {
  userId: string;
  walletId: string;
  asset: string;
  previousBalance: number;
  newBalance: number;
  reason: string;
  timestamp: Date;
}

export interface TransactionFailedEvent {
  userId: string;
  transactionId: string;
  asset: string;
  amount: number;
  reason: string;
  timestamp: Date;
}

export class InAppNotificationService {
  private readonly logger = new Logger(InAppNotificationService.name);

  constructor(
    @InjectRepository(InAppNotification)
    private notificationRepository: Repository<InAppNotification>,
    private emailService: EmailService,
    private eventEmitter: EventEmitter2,
  ) {}

  async createNotification(
    payload: NotificationPayload,
  ): Promise<InAppNotification> {
    const {
      userId,
      type,
      title,
      content,
      channel = NotificationChannel.BOTH,
      metadata,
    } = payload;

    const notification = this.notificationRepository.create({
      userId,
      type,
      title,
      content,
      channel,
      metadata: metadata ? JSON.stringify(metadata) : undefined,
    });

    await this.notificationRepository.save(notification);
    this.logger.log(`Created notification for user ${userId} of type ${type}`);

    // Send email if channel is EMAIL or BOTH
    if (
      channel === NotificationChannel.EMAIL ||
      channel === NotificationChannel.BOTH
    ) {
      await this.sendEmailNotification(userId, type, title, content, metadata);
    }

    return notification;
  }

  private async sendEmailNotification(
    userId: string,
    type: NotificationType,
    title: string,
    content: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    const userEmail = await this.getUserEmail(userId);

    if (!userEmail) {
      this.logger.warn(
        `Cannot send email notification: No email found for user ${userId}`,
      );
      return;
    }

    const templateName = this.getTemplateForNotificationType(type);

    await this.emailService.sendEmail(userEmail, title, templateName, {
      title,
      content,
      ...metadata,
      appName: process.env.APP_NAME || 'Your Platform',
      supportEmail: process.env.SUPPORT_EMAIL || 'support@example.com',
    });
  }

  private getTemplateForNotificationType(type: NotificationType): string {
    switch (type) {
      case NotificationType.SWAP_COMPLETED:
        return 'swap-completed';
      case NotificationType.WALLET_UPDATED:
        return 'wallet-updated';
      case NotificationType.TRANSACTION_FAILED:
        return 'transaction-failed';
      case NotificationType.DEPOSIT_CONFIRMED:
        return 'deposit-confirmed';
      case NotificationType.WITHDRAWAL_PROCESSED:
        return 'withdrawal-processed';
      default:
        return 'generic';
    }
  }

  private async getUserEmail(userId: string): Promise<string> {
    // This is a placeholder implementation as there is no provider in the user's service to fetch the user's email
    return 'user@example.com';
  }

  async getUnreadNotifications(userId: string): Promise<InAppNotification[]> {
    return this.notificationRepository.find({
      where: {
        userId,
        isRead: false,
        isActive: true,
        channel: In([NotificationChannel.IN_APP, NotificationChannel.BOTH]),
      },
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async getAllNotifications(
    userId: string,
    page = 1,
    limit = 10,
  ): Promise<[InAppNotification[], number]> {
    return this.notificationRepository.findAndCount({
      where: {
        userId,
        isActive: true,
        channel: In([NotificationChannel.IN_APP, NotificationChannel.BOTH]),
      },
      order: {
        createdAt: 'DESC',
      },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  async markAsRead(id: string, userId: string): Promise<boolean> {
    const result = await this.notificationRepository.update(
      { id, userId },
      { isRead: true },
    );
    return (result.affected ?? 0) > 0;
  }

  async markAllAsRead(userId: string): Promise<boolean> {
    const result = await this.notificationRepository.update(
      { userId, isRead: false },
      { isRead: true },
    );
    return (result.affected ?? 0) > 0;
  }

  @OnEvent('swap.completed')
  async handleSwapCompletedEvent(event: SwapCompletedEvent) {
    const { userId, swapId, fromAsset, toAsset, fromAmount, toAmount } = event;

    await this.createNotification({
      userId,
      type: NotificationType.SWAP_COMPLETED,
      title: 'Swap Completed Successfully',
      content: `Your swap of ${fromAmount} ${fromAsset} to ${toAmount} ${toAsset} has been completed successfully.`,
      metadata: {
        swapId,
        fromAsset,
        toAsset,
        fromAmount,
        toAmount,
      },
    });
  }

  @OnEvent('wallet.updated')
  async handleWalletUpdatedEvent(event: WalletUpdatedEvent) {
    const { userId, walletId, asset, previousBalance, newBalance, reason } =
      event;

    await this.createNotification({
      userId,
      type: NotificationType.WALLET_UPDATED,
      title: 'Wallet Balance Updated',
      content: `Your ${asset} wallet balance has been updated from ${previousBalance} to ${newBalance}.`,
      metadata: {
        walletId,
        asset,
        previousBalance,
        newBalance,
        reason,
      },
    });
  }

  @OnEvent('transaction.failed')
  async handleTransactionFailedEvent(event: TransactionFailedEvent) {
    const { userId, transactionId, asset, amount, reason } = event;

    await this.createNotification({
      userId,
      type: NotificationType.TRANSACTION_FAILED,
      title: 'Transaction Failed',
      content: `Your transaction of ${amount} ${asset} has failed. Reason: ${reason}`,
      metadata: {
        transactionId,
        asset,
        amount,
        reason,
      },
    });
  }
}
