import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { Notification } from './entities/notification.entity';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
  ) {}

  async create(
    createNotificationDto: CreateNotificationDto,
  ): Promise<Notification> {
    const notification = this.notificationRepository.create(
      createNotificationDto,
    );
    return this.notificationRepository.save(notification);
  }

  async findAll(userId: string, page = 1, limit = 10): Promise<Notification[]> {
    return this.notificationRepository.find({
      where: { userId },
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Notification | null> {
    return await this.notificationRepository.findOneById(id);
  }

  async update(
    id: string,
    updateNotificationDto: Partial<CreateNotificationDto>,
  ): Promise<Notification | null> {
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

  async findUnread(userId: string): Promise<Notification[]> {
    return this.notificationRepository.find({
      where: { userId, isRead: false },
      order: { createdAt: 'DESC' },
    });
  }
}
