import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Repository, In } from 'typeorm';
import {
  Notification,
  NotificationStatus,
  NotificationType,
} from './entities/notification.entity';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';
import {
  NotificationResponseDto,
  PaginatedNotificationResponse,
} from './dto/notification-response.dto';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('NotificationsService');

  constructor(
    @InjectRepository(Notification)
    private notificationsRepository: Repository<Notification>,
  ) {}

  async create(
    createNotificationDto: CreateNotificationDto,
  ): Promise<NotificationResponseDto> {
    try {
      const notification = this.notificationsRepository.create(
        createNotificationDto,
      );
      const saved = await this.notificationsRepository.save(notification);
      return this.mapToResponseDto(saved);
    } catch (error) {
      this.logger.error('Failed to create notification', error);
      throw new BadRequestException('Failed to create notification');
    }
  }
  async updateBatchStatus(
    notificationIds: string[],
    status: NotificationStatus,
  ): Promise<{ updated: number }> {
    if (!notificationIds || notificationIds.length === 0) {
      throw new BadRequestException('Notification IDs are required');
    }

    const result = await this.notificationsRepository.update(
      { id: In(notificationIds) },
      { status },
    );

    return { updated: result.affected || 0 };
  }

  async findAll(
    userId: string,
    page: number = 1,
    limit: number = 10,
    type?: NotificationType,
    status?: NotificationStatus,
  ): Promise<PaginatedNotificationResponse> {
    try {
      const query =
        this.notificationsRepository.createQueryBuilder('notification');

      query.where('notification.userId = :userId', { userId });

      if (type) {
        query.andWhere('notification.type = :type', { type });
      }

      if (status) {
        query.andWhere('notification.status = :status', { status });
      }

      query.orderBy('notification.createdAt', 'DESC');

      const total = await query.getCount();
      const skip = (page - 1) * limit;

      const notifications = await query.skip(skip).take(limit).getMany();

      return {
        data: notifications.map((n) => this.mapToResponseDto(n)),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      this.logger.error('Failed to fetch notifications', error);
      throw new BadRequestException('Failed to fetch notifications');
    }
  }

  async findById(id: string): Promise<NotificationResponseDto> {
    const notification = await this.notificationsRepository.findOne({
      where: { id },
    });

    if (!notification) {
      throw new NotFoundException(`Notification with ID ${id} not found`);
    }

    return this.mapToResponseDto(notification);
  }

  async findByUserId(userId: string): Promise<NotificationResponseDto[]> {
    const notifications = await this.notificationsRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    return notifications.map((n) => this.mapToResponseDto(n));
  }

  async markAsRead(id: string): Promise<NotificationResponseDto> {
    const notification = await this.notificationsRepository.findOne({
      where: { id },
    });

    if (!notification) {
      throw new NotFoundException(`Notification with ID ${id} not found`);
    }

    notification.status = NotificationStatus.READ;
    notification.readAt = new Date();

    const updated = await this.notificationsRepository.save(notification);
    return this.mapToResponseDto(updated);
  }

  async markMultipleAsRead(
    notificationIds: string[],
  ): Promise<NotificationResponseDto[]> {
    if (!notificationIds || notificationIds.length === 0) {
      throw new BadRequestException('Notification IDs are required');
    }

    await this.notificationsRepository.update(
      { id: In(notificationIds) },
      {
        status: NotificationStatus.READ,
        readAt: new Date(),
      },
    );

    const updated = await this.notificationsRepository.find({
      where: { id: In(notificationIds) },
    });

    return updated.map((n) => this.mapToResponseDto(n));
  }

  async markAllAsRead(userId: string): Promise<{ updated: number }> {
    const result = await this.notificationsRepository.update(
      { userId, status: NotificationStatus.UNREAD },
      {
        status: NotificationStatus.READ,
        readAt: new Date(),
      },
    );

    return { updated: result.affected || 0 };
  }

  async getUnreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.notificationsRepository.countBy({
      userId,
      status: NotificationStatus.UNREAD,
    });

    return { count };
  }

  async delete(id: string): Promise<{ success: boolean }> {
    const result = await this.notificationsRepository.delete(id);

    if (result.affected === 0) {
      throw new NotFoundException(`Notification with ID ${id} not found`);
    }

    return { success: true };
  }

  async deleteMultiple(
    notificationIds: string[],
  ): Promise<{ deleted: number }> {
    if (!notificationIds || notificationIds.length === 0) {
      throw new BadRequestException('Notification IDs are required');
    }

    const result = await this.notificationsRepository.delete(notificationIds);
    return { deleted: result.affected || 0 };
  }

  async deleteAllByUser(userId: string): Promise<{ deleted: number }> {
    const result = await this.notificationsRepository.delete({ userId });
    return { deleted: result.affected || 0 };
  }

  async findByType(
    userId: string,
    type: NotificationType,
  ): Promise<NotificationResponseDto[]> {
    const notifications = await this.notificationsRepository.find({
      where: { userId, type },
      order: { createdAt: 'DESC' },
    });

    return notifications.map((n) => this.mapToResponseDto(n));
  }

  async findByStatus(
    userId: string,
    status: NotificationStatus,
  ): Promise<NotificationResponseDto[]> {
    const notifications = await this.notificationsRepository.find({
      where: { userId, status },
      order: { createdAt: 'DESC' },
    });

    return notifications.map((n) => this.mapToResponseDto(n));
  }

  async update(
    id: string,
    updateNotificationDto: UpdateNotificationDto,
  ): Promise<NotificationResponseDto> {
    const notification = await this.notificationsRepository.findOne({
      where: { id },
    });

    if (!notification) {
      throw new NotFoundException(`Notification with ID ${id} not found`);
    }

    Object.assign(notification, updateNotificationDto);
    const updated = await this.notificationsRepository.save(notification);
    return this.mapToResponseDto(updated);
  }

  private mapToResponseDto(
    notification: Notification,
  ): NotificationResponseDto {
    return {
      id: notification.id,
      userId: notification.userId,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      status: notification.status,
      metadata: notification.metadata,
      relatedId: notification.relatedId,
      actionUrl: notification.actionUrl,
      createdAt: notification.createdAt,
      updatedAt: notification.updatedAt,
      readAt: notification.readAt,
    };
  }
}
