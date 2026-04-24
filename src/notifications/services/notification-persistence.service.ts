import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import {
  Notification,
  NotificationStatus,
} from '../entities/notification.entity';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class NotificationPersistenceService {
  private readonly logger = new Logger(NotificationPersistenceService.name);
  private readonly ARCHIVE_THRESHOLD_DAYS = 90;

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
  ) {}

  /**
   * Get paginated notifications for a user with unreadCount
   */
  async getUserNotifications(
    userId: string,
    page: number = 1,
    limit: number = 20,
    filter?: { read?: boolean; archived?: boolean },
  ): Promise<{
    notifications: Notification[];
    unreadCount: number;
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
  }> {
    const where: any = {
      userId,
      isDeleted: false,
    };

    if (filter) {
      if (filter.read !== undefined) {
        where.status = filter.read
          ? NotificationStatus.READ
          : NotificationStatus.UNREAD;
      }
      if (filter.archived !== undefined) {
        where.isArchived = filter.archived;
      } else {
        // Default: show only non-archived
        where.isArchived = false;
      }
    } else {
      where.isArchived = false;
    }

    const [notifications, total] =
      await this.notificationRepository.findAndCount({
        where,
        order: { createdAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      });

    // Get unread count (across all non-archived)
    const unreadCount = await this.notificationRepository.count({
      where: {
        userId,
        status: NotificationStatus.UNREAD,
        isArchived: false,
        isDeleted: false,
      },
    });

    return {
      notifications,
      unreadCount,
      total,
      page,
      limit,
      hasMore: page * limit < total,
    };
  }

  /**
   * Mark single notification as read
   */
  async markAsRead(
    notificationId: string,
    userId: string,
  ): Promise<Notification> {
    const notification = await this.notificationRepository.findOne({
      where: { id: notificationId, userId, isDeleted: false },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.status === NotificationStatus.READ) {
      return notification; // Already read
    }

    notification.status = NotificationStatus.READ;
    notification.readAt = new Date();

    return this.notificationRepository.save(notification);
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string): Promise<{ updated: number }> {
    const result = await this.notificationRepository.update(
      {
        userId,
        status: NotificationStatus.UNREAD,
        isArchived: false,
        isDeleted: false,
      },
      {
        status: NotificationStatus.READ,
        readAt: new Date(),
      },
    );

    return { updated: result.affected || 0 };
  }

  /**
   * Soft delete a notification
   */
  async softDelete(
    notificationId: string,
    userId: string,
  ): Promise<{ message: string }> {
    const notification = await this.notificationRepository.findOne({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    notification.isDeleted = true;
    await this.notificationRepository.save(notification);

    return { message: 'Notification deleted successfully' };
  }

  /**
   * Get unread badge count
   */
  async getUnreadCount(userId: string): Promise<{ unreadCount: number }> {
    const count = await this.notificationRepository.count({
      where: {
        userId,
        status: NotificationStatus.UNREAD,
        isArchived: false,
        isDeleted: false,
      },
    });

    return { unreadCount: count };
  }

  /**
   * Auto-archive notifications older than 90 days (runs daily at 2 AM)
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async archiveOldNotifications(): Promise<void> {
    try {
      const thresholdDate = new Date();
      thresholdDate.setDate(
        thresholdDate.getDate() - this.ARCHIVE_THRESHOLD_DAYS,
      );

      const result = await this.notificationRepository.update(
        {
          isArchived: false,
          isDeleted: false,
          createdAt: LessThan(thresholdDate),
        },
        {
          isArchived: true,
          archivedAt: new Date(),
        },
      );

      if (result.affected && result.affected > 0) {
        this.logger.log(
          `Auto-archived ${result.affected} notifications older than ${this.ARCHIVE_THRESHOLD_DAYS} days`,
        );
      }
    } catch (error) {
      this.logger.error(`Failed to auto-archive notifications: ${error.message}`);
    }
  }

  /**
   * Create and persist notification (used by NotificationsService)
   */
  async createNotification(
    data: Partial<Notification>,
  ): Promise<Notification> {
    const notification = this.notificationRepository.create(data);
    return this.notificationRepository.save(notification);
  }
}

