import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';
import {
  BatchMarkAsReadDto,
  BatchDeleteDto,
  BatchUpdateStatusDto,
} from './dto/batch-notification.dto';
import {
  NotificationType,
  NotificationStatus,
} from './entities/notification.entity';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post()
  @ApiOperation({ summary: 'Create notification' })
  @ApiResponse({ status: 201, description: 'Notification created' })
  create(@Body() createNotificationDto: CreateNotificationDto) {
    return this.notificationsService.create(createNotificationDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get notifications for authenticated user' })
  @ApiResponse({ status: 200, description: 'Notifications retrieved' })
  findAll(
    @CurrentUser() user: CurrentUserPayload,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('type') type?: NotificationType,
    @Query('status') status?: NotificationStatus,
  ) {
    return this.notificationsService.findAll(
      user.userId,
      Number(page),
      Number(limit),
      type,
      status,
    );
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count' })
  getUnreadCount(@CurrentUser() user: CurrentUserPayload) {
    return this.notificationsService.getUnreadCount(user.userId);
  }

  @Get('by-type')
  @ApiOperation({ summary: 'Get notifications by type' })
  getByType(
    @CurrentUser() user: CurrentUserPayload,
    @Query('type') type: NotificationType,
  ) {
    return this.notificationsService.findByType(user.userId, type);
  }

  @Get('by-status')
  @ApiOperation({ summary: 'Get notifications by status' })
  getByStatus(
    @CurrentUser() user: CurrentUserPayload,
    @Query('status') status: NotificationStatus,
  ) {
    return this.notificationsService.findByStatus(user.userId, status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get notification by ID' })
  findOne(@Param('id') id: string) {
    return this.notificationsService.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update notification' })
  update(
    @Param('id') id: string,
    @Body() updateNotificationDto: UpdateNotificationDto,
  ) {
    return this.notificationsService.update(id, updateNotificationDto);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark notification as read' })
  markAsRead(@Param('id') id: string) {
    return this.notificationsService.markAsRead(id);
  }

  @Patch('batch/read')
  @ApiOperation({ summary: 'Mark multiple notifications as read' })
  markMultipleAsRead(@Body() batchMarkAsReadDto: BatchMarkAsReadDto) {
    return this.notificationsService.markMultipleAsRead(
      batchMarkAsReadDto.notificationIds,
    );
  }

  @Patch('batch/mark-all-read')
  @ApiOperation({
    summary: 'Mark all notifications as read for authenticated user',
  })
  markAllAsRead(@CurrentUser() user: CurrentUserPayload) {
    return this.notificationsService.markAllAsRead(user.userId);
  }

  @Patch('batch/status')
  @ApiOperation({ summary: 'Update status of multiple notifications' })
  updateBatchStatus(@Body() batchUpdateStatusDto: BatchUpdateStatusDto) {
    return this.notificationsService.updateBatchStatus(
      batchUpdateStatusDto.notificationIds,
      batchUpdateStatusDto.status,
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete notification' })
  delete(@Param('id') id: string) {
    return this.notificationsService.delete(id);
  }

  @Delete('batch/delete')
  @ApiOperation({ summary: 'Delete multiple notifications' })
  deleteMultiple(@Body() batchDeleteDto: BatchDeleteDto) {
    return this.notificationsService.deleteMultiple(
      batchDeleteDto.notificationIds,
    );
  }

  @Delete('user')
  @ApiOperation({ summary: 'Delete all notifications for authenticated user' })
  deleteAllByUser(@CurrentUser() user: CurrentUserPayload) {
    return this.notificationsService.deleteAllByUser(user.userId);
  }
}
