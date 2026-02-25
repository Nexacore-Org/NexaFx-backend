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
  ApiQuery,
  ApiParam,
  ApiBody,
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
  @ApiOperation({
    summary: 'Create a new notification',
    description:
      'Creates a notification record for a user (usually called internally)',
  })
  @ApiBody({ type: CreateNotificationDto })
  @ApiResponse({
    status: 201,
    description: 'Notification created successfully',
    type: 'object',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid notification data',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  create(@Body() createNotificationDto: CreateNotificationDto) {
    return this.notificationsService.create(createNotificationDto);
  }

  @Get('unread-count')
  @ApiOperation({
    summary: 'Get unread notification count',
    description:
      'Returns the count of unread notifications for the authenticated user',
  })
  @ApiResponse({
    status: 200,
    description: 'Unread count retrieved successfully',
    schema: { example: { count: 5 } },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  getUnreadCount(@CurrentUser() user: CurrentUserPayload) {
    return this.notificationsService.getUnreadCount(user.userId);
  }

  @Get('by-type')
  @ApiOperation({
    summary: 'Get notifications by type',
    description:
      'Retrieves all notifications of a specific type for the authenticated user',
  })
  @ApiQuery({
    name: 'type',
    enum: NotificationType,
    required: true,
    description: 'Notification type to filter by',
  })
  @ApiResponse({
    status: 200,
    description: 'Notifications retrieved successfully',
    isArray: true,
    type: 'object',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  getByType(
    @CurrentUser() user: CurrentUserPayload,
    @Query('type') type: NotificationType,
  ) {
    return this.notificationsService.findByType(user.userId, type);
  }

  @Get('by-status')
  @ApiOperation({
    summary: 'Get notifications by status',
    description:
      'Retrieves all notifications with a specific status for the authenticated user',
  })
  @ApiQuery({
    name: 'status',
    enum: NotificationStatus,
    required: true,
    description: 'Notification status to filter by',
  })
  @ApiResponse({
    status: 200,
    description: 'Notifications retrieved successfully',
    isArray: true,
    type: 'object',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  getByStatus(
    @CurrentUser() user: CurrentUserPayload,
    @Query('status') status: NotificationStatus,
  ) {
    return this.notificationsService.findByStatus(user.userId, status);
  }

  @Get()
  @ApiOperation({
    summary: 'Get notifications for authenticated user',
    description:
      'Retrieves a paginated list of notifications for the authenticated user with optional filtering',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 20, max: 100)',
  })
  @ApiQuery({
    name: 'type',
    enum: NotificationType,
    required: false,
    description: 'Filter by notification type',
  })
  @ApiQuery({
    name: 'status',
    enum: NotificationStatus,
    required: false,
    description: 'Filter by notification status',
  })
  @ApiResponse({
    status: 200,
    description: 'Notifications retrieved successfully',
    schema: {
      example: {
        data: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
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

  @Get(':id')
  @ApiOperation({
    summary: 'Get a notification by ID',
    description: 'Retrieves detailed information about a specific notification',
  })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Notification ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Notification retrieved successfully',
    type: 'object',
  })
  @ApiResponse({
    status: 404,
    description: 'Notification not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  findOne(@Param('id') id: string) {
    return this.notificationsService.findById(id);
  }

  @Patch('batch/mark-all-read')
  @ApiOperation({
    summary: 'Mark all notifications as read',
    description:
      'Marks all unread notifications as read for the authenticated user',
  })
  @ApiResponse({
    status: 200,
    description: 'All notifications marked as read',
    schema: { example: { updated: 10 } },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  markAllAsRead(@CurrentUser() user: CurrentUserPayload) {
    return this.notificationsService.markAllAsRead(user.userId);
  }

  @Patch('batch/read')
  @ApiOperation({
    summary: 'Mark multiple notifications as read',
    description: 'Marks specified notifications as read',
  })
  @ApiBody({ type: BatchMarkAsReadDto })
  @ApiResponse({
    status: 200,
    description: 'Notifications marked as read successfully',
    isArray: true,
    type: 'object',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid notification IDs',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  markMultipleAsRead(@Body() batchMarkAsReadDto: BatchMarkAsReadDto) {
    return this.notificationsService.markMultipleAsRead(
      batchMarkAsReadDto.notificationIds,
    );
  }

  @Patch('batch/status')
  @ApiOperation({
    summary: 'Update status of multiple notifications',
    description: 'Updates the status of specified notifications',
  })
  @ApiBody({ type: BatchUpdateStatusDto })
  @ApiResponse({
    status: 200,
    description: 'Notification statuses updated successfully',
    schema: { example: { updated: 5 } },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid notification IDs or status',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  updateBatchStatus(@Body() batchUpdateStatusDto: BatchUpdateStatusDto) {
    return this.notificationsService.updateBatchStatus(
      batchUpdateStatusDto.notificationIds,
      batchUpdateStatusDto.status,
    );
  }

  @Patch(':id/read')
  @ApiOperation({
    summary: 'Mark a notification as read',
    description: 'Marks a single notification as read',
  })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Notification ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Notification marked as read successfully',
    type: 'object',
  })
  @ApiResponse({
    status: 404,
    description: 'Notification not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  markAsRead(@Param('id') id: string) {
    return this.notificationsService.markAsRead(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a notification',
    description: 'Updates the details of a specific notification',
  })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Notification ID',
  })
  @ApiBody({ type: UpdateNotificationDto })
  @ApiResponse({
    status: 200,
    description: 'Notification updated successfully',
    type: 'object',
  })
  @ApiResponse({
    status: 404,
    description: 'Notification not found',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid update data',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  update(
    @Param('id') id: string,
    @Body() updateNotificationDto: UpdateNotificationDto,
  ) {
    return this.notificationsService.update(id, updateNotificationDto);
  }

  @Delete('batch/delete')
  @ApiOperation({
    summary: 'Delete multiple notifications',
    description: 'Deletes specified notifications',
  })
  @ApiBody({ type: BatchDeleteDto })
  @ApiResponse({
    status: 200,
    description: 'Notifications deleted successfully',
    schema: { example: { deleted: 5 } },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid notification IDs',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  deleteMultiple(@Body() batchDeleteDto: BatchDeleteDto) {
    return this.notificationsService.deleteMultiple(
      batchDeleteDto.notificationIds,
    );
  }

  @Delete('my/all')
  @ApiOperation({
    summary: 'Delete all notifications for authenticated user',
    description:
      'Permanently deletes all notifications for the authenticated user',
  })
  @ApiResponse({
    status: 200,
    description: 'All notifications deleted successfully',
    schema: { example: { deleted: 25 } },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  deleteAllByUser(@CurrentUser() user: CurrentUserPayload) {
    return this.notificationsService.deleteAllByUser(user.userId);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a notification',
    description: 'Permanently deletes a specific notification',
  })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Notification ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Notification deleted successfully',
    schema: { example: { success: true } },
  })
  @ApiResponse({
    status: 404,
    description: 'Notification not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  delete(@Param('id') id: string) {
    return this.notificationsService.delete(id);
  }
}
