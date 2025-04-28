import { Controller, Get, Post, Body, Patch, Param } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { ApiTags, ApiResponse } from '@nestjs/swagger';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post()
  @ApiResponse({ status: 201, description: 'Notification created.' })
  create(@Body() createNotificationDto: CreateNotificationDto) {
    return this.notificationsService.create(createNotificationDto);
  }

  @Get('unread/:userId')
  @ApiResponse({
    status: 200,
    description: 'Get unread notifications for a user.',
  })
  findUnread(@Param('userId') userId: string) {
    return this.notificationsService.findUnread(userId);
  }

  @Patch('mark-read/:id')
  @ApiResponse({ status: 200, description: 'Mark notification as read.' })
  markAsRead(@Param('id') id: string) {
    return this.notificationsService.markAsRead(id);
  }

  @Patch('mark-all-read/:userId')
  @ApiResponse({
    status: 200,
    description: 'Mark all notifications as read for a user.',
  })
  markAllAsRead(@Param('userId') userId: string) {
    return this.notificationsService.markAllAsReadForUser(userId);
  }
}
