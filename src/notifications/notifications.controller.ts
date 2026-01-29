import { Controller, Get, Post, Patch, Delete, Body } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';
import {
  BatchMarkAsReadDto,
  BatchDeleteDto,
  BatchUpdateStatusDto,
  MarkAllAsReadDto,
} from './dto/batch-notification.dto';
import {
  NotificationType,
  NotificationStatus,
} from './entities/notification.entity';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post()
  create(createNotificationDto: CreateNotificationDto) {
    return this.notificationsService.create(createNotificationDto);
  }

  @Get()
  findAll(
    userId: string,
    page: number = 1,
    limit: number = 20,
    type?: NotificationType,
    status?: NotificationStatus,
  ) {
    return this.notificationsService.findAll(userId, page, limit, type, status);
  }

  @Get('unread-count')
  getUnreadCount(userId: string) {
    return this.notificationsService.getUnreadCount(userId);
  }

  @Get('by-type')
  getByType(userId: string, type: NotificationType) {
    return this.notificationsService.findByType(userId, type);
  }

  @Get('by-status')
  getByStatus(userId: string, status: NotificationStatus) {
    return this.notificationsService.findByStatus(userId, status);
  }

  @Get('user/:userId')
  findByUser(userId: string) {
    return this.notificationsService.findByUserId(userId);
  }

  @Get(':id')
  findOne(id: string) {
    return this.notificationsService.findById(id);
  }

  @Patch(':id')
  update(id: string, updateNotificationDto: UpdateNotificationDto) {
    return this.notificationsService.update(id, updateNotificationDto);
  }

  @Patch(':id/read')
  markAsRead(id: string) {
    return this.notificationsService.markAsRead(id);
  }

  @Patch('batch/read')
  markMultipleAsRead(batchMarkAsReadDto: BatchMarkAsReadDto) {
    return this.notificationsService.markMultipleAsRead(
      batchMarkAsReadDto.notificationIds,
    );
  }

  @Patch('batch/mark-all-read')
  markAllAsRead(markAllAsReadDto: MarkAllAsReadDto) {
    return this.notificationsService.markAllAsRead(markAllAsReadDto.userId);
  }

  @Patch('batch/status')
  updateBatchStatus(batchUpdateStatusDto: BatchUpdateStatusDto) {
    return this.notificationsService.markMultipleAsRead(
      batchUpdateStatusDto.notificationIds,
    );
  }

  @Delete(':id')
  delete(id: string) {
    return this.notificationsService.delete(id);
  }

  @Delete('batch/delete')
  deleteMultiple(batchDeleteDto: BatchDeleteDto) {
    return this.notificationsService.deleteMultiple(
      batchDeleteDto.notificationIds,
    );
  }

  @Delete('user/:userId')
  deleteAllByUser(userId: string) {
    return this.notificationsService.deleteAllByUser(userId);
  }
}
