import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { CreateNotificationDto } from '../dto/create-notification.dto';
import { Notifications } from '../entities/notification.entity';
import { NotificationChannel } from '../enum/notificationChannel.enum';
import { NotificationType } from '../enum/notificationType.enum';
import { UserService } from 'src/user/providers/user.service';
import { OnEvent } from '@nestjs/event-emitter';
import {
  SwapCompletedEvent,
  TransactionFailedEvent,
  WalletUpdatedEvent,
} from '../interfacs/notifications.interfcaes';
import { MailService } from 'src/mail/mail.service';
import { GetAllNotificationsQueryDto } from '../dto/get-all-notifications-query.dto';
import {
  GetAllNotificationsResponseDto,
  NotificationResponseDto,
} from '../dto/get-all-notifications-response.dto';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  s;
  constructor(
    @InjectRepository(Notifications)
    private readonly notificationRepository: Repository<Notifications>,
    private readonly emailService: MailService,
    private readonly userService: UserService,
  ) {}

  async create(
    createNotificationDto: CreateNotificationDto,
  ): Promise<Notifications> {
    const {
      userId,
      type,
      title,
      message,
      channel = NotificationChannel.BOTH,
      metadata,
    } = createNotificationDto;

    const notification = this.notificationRepository.create({
      userId,
      type,
      title,
      message,
      channel,
      metadata,
    });

    await this.notificationRepository.save(notification);
    this.logger.log(`Created notification for user ${userId} of type ${type}`);

    if (
      channel === NotificationChannel.EMAIL ||
      channel === NotificationChannel.BOTH
    ) {
      await this.sendEmailNotification(userId, type, title, message, metadata);
    }

    return notification;
  }

  async findAll(
    userId: string,
    page = 1,
    limit = 10,
  ): Promise<Notifications[]> {
    return this.notificationRepository.find({
      where: { userId },
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Notifications | null> {
    return await this.notificationRepository.findOneById(id);
  }

  async update(
    id: string,
    updateNotificationDto: Partial<CreateNotificationDto>,
  ): Promise<Notifications | null> {
    await this.notificationRepository.update(id, updateNotificationDto);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    await this.notificationRepository.delete(id);
  }

  async markAsRead(id: string): Promise<void> {
    await this.notificationRepository.update(id, { isRead: true });
  }

  async markAllAsReadForUser(userId: string): Promise<void> {
    await this.notificationRepository.update(
      { userId, isRead: false },
      { isRead: true },
    );
  }

  async findUnread(userId: string): Promise<Notifications[]> {
    return this.notificationRepository.find({
      where: { userId, isRead: false },
      order: { createdAt: 'DESC' },
    });
  }

  async getAllNotificationsForUser(
    userId: string,
    queryDto: GetAllNotificationsQueryDto,
  ): Promise<GetAllNotificationsResponseDto> {
    const {
      page = 1,
      limit = 10,
      isRead,
      type,
      category,
      priority,
      fromDate,
      toDate,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
      search,
      relatedEntityType,
    } = queryDto;

    // Build the query
    const queryBuilder: SelectQueryBuilder<Notifications> =
      this.notificationRepository
        .createQueryBuilder('notification')
        .where('notification.userId = :userId', { userId });

    // Apply filters
    if (isRead !== undefined) {
      queryBuilder.andWhere('notification.isRead = :isRead', { isRead });
    }

    if (type) {
      queryBuilder.andWhere('notification.type = :type', { type });
    }

    if (category) {
      queryBuilder.andWhere('notification.category = :category', { category });
    }

    if (priority) {
      queryBuilder.andWhere('notification.priority = :priority', { priority });
    }

    if (relatedEntityType) {
      queryBuilder.andWhere(
        'notification.relatedEntityType = :relatedEntityType',
        {
          relatedEntityType,
        },
      );
    }

    if (fromDate) {
      queryBuilder.andWhere('notification.createdAt >= :fromDate', {
        fromDate: new Date(fromDate),
      });
    }

    if (toDate) {
      queryBuilder.andWhere('notification.createdAt <= :toDate', {
        toDate: new Date(toDate),
      });
    }

    if (search) {
      queryBuilder.andWhere(
        '(notification.title ILIKE :search OR notification.message ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    // Apply sorting
    queryBuilder.orderBy(`notification.${sortBy}`, sortOrder);

    // Get total count for pagination
    const totalItems = await queryBuilder.getCount();

    // Apply pagination
    const skip = (page - 1) * limit;
    queryBuilder.skip(skip).take(limit);

    // Execute query
    const notifications = await queryBuilder.getMany();

    // Get summary statistics for the user
    const [totalUnread, totalRead, lastNotification] = await Promise.all([
      this.notificationRepository.count({
        where: { userId, isRead: false },
      }),
      this.notificationRepository.count({
        where: { userId, isRead: true },
      }),
      this.notificationRepository.findOne({
        where: { userId },
        order: { createdAt: 'DESC' },
      }),
    ]);

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalItems / limit);
    const hasPreviousPage = page > 1;
    const hasNextPage = page < totalPages;

    return {
      notifications: notifications.map(
        (notification) => new NotificationResponseDto(notification),
      ),
      meta: {
        page,
        limit,
        totalItems,
        totalPages,
        hasPreviousPage,
        hasNextPage,
      },
      summary: {
        totalUnread,
        totalRead,
        lastNotificationDate: lastNotification?.createdAt,
      },
    };
  }

  private async sendEmailNotification(
    userId: string,
    type: NotificationType,
    title: string,
    content: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    const userEmail = (await this.userService.findOne(userId)).email;

    if (!userEmail) {
      this.logger.warn(
        `Cannot send email notification: No email found for user ${userId}`,
      );
      return;
    }

    const templateName = this.getTemplateForNotificationType(type);

    await this.emailService.sendEmail({
      to: userEmail,
      subject: title,
      templateName,
      context: {
        title,
        content,
        ...metadata,
        appName: process.env.APP_NAME || 'Your Platform',
        supportEmail: process.env.SUPPORT_EMAIL || 'support@example.com',
      },
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

  @OnEvent('swap.completed')
  async handleSwapCompletedEvent(event: SwapCompletedEvent) {
    await this.create({
      userId: event.userId,
      type: NotificationType.SWAP_COMPLETED,
      title: 'Swap Completed Successfully',
      message: `Your swap of ${event.fromAmount} ${event.fromAsset} to ${event.toAmount} ${event.toAsset} has been completed successfully.`,
      metadata: { ...event },
      channel: NotificationChannel.BOTH,
    });
  }

  @OnEvent('wallet.updated')
  async handleWalletUpdatedEvent(event: WalletUpdatedEvent) {
    await this.create({
      userId: event.userId,
      type: NotificationType.WALLET_UPDATED,
      title: 'Wallet Balance Updated',
      message: `Your ${event.asset} wallet balance has been updated from ${event.previousBalance} to ${event.newBalance}.`,
      metadata: { ...event },
      channel: NotificationChannel.BOTH,
    });
  }

  @OnEvent('transaction.failed')
  async handleTransactionFailedEvent(event: TransactionFailedEvent) {
    await this.create({
      userId: event.userId,
      type: NotificationType.TRANSACTION_FAILED,
      title: 'Transaction Failed',
      message: `Your transaction of ${event.amount} ${event.asset} has failed. Reason: ${event.reason}`,
      metadata: { ...event },
      channel: NotificationChannel.BOTH,
    });
  }
}
