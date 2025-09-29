import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiParam,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationsService } from './providers/notifications.service';
import { JwtAuthGuard } from '../auth/guard/jwt.auth.guard';
import { GetAllNotificationsQueryDto } from './dto/get-all-notifications-query.dto';
import { GetAllNotificationsResponseDto } from './dto/get-all-notifications-response.dto';

@ApiTags('Notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new notification' })
  @ApiBody({
    type: CreateNotificationDto,
    examples: {
      default: {
        value: {
          /* fill with example fields */
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Notification created.' })
  create(@Body() createNotificationDto: CreateNotificationDto) {
    return this.notificationsService.create(createNotificationDto);
  }

  @Get('unread/:userId')
  @ApiOperation({ summary: 'Get unread notifications for a user' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'Unread notifications for user.' })
  findUnread(@Param('userId') userId: string) {
    return this.notificationsService.findUnread(userId);
  }

  @Patch('mark-read/:id')
  @ApiOperation({ summary: 'Mark a notification as read' })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  @ApiResponse({ status: 200, description: 'Notification marked as read.' })
  markAsRead(@Param('id') id: string) {
    return this.notificationsService.markAsRead(id);
  }

  @Patch('mark-all-read/:userId')
  @ApiOperation({ summary: 'Mark all notifications as read for a user' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({
    status: 200,
    description: 'All notifications marked as read for user.',
  })
  markAllAsRead(@Param('userId') userId: string) {
    return this.notificationsService.markAllAsReadForUser(userId);
  }

  @Get('all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all notifications for authenticated user' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of items per page (default: 10)',
    example: 10,
  })
  @ApiQuery({
    name: 'isRead',
    required: false,
    type: Boolean,
    description: 'Filter by read status',
    example: false,
  })
  @ApiQuery({
    name: 'type',
    required: false,
    type: String,
    description: 'Filter by notification type',
    example: 'TRANSACTION_COMPLETED',
  })
  @ApiQuery({
    name: 'category',
    required: false,
    type: String,
    description: 'Filter by notification category',
    example: 'TRANSACTION',
  })
  @ApiQuery({
    name: 'priority',
    required: false,
    type: String,
    description: 'Filter by notification priority',
    example: 'HIGH',
  })
  @ApiQuery({
    name: 'fromDate',
    required: false,
    type: String,
    description: 'Filter from date (ISO string)',
    example: '2023-01-01T00:00:00Z',
  })
  @ApiQuery({
    name: 'toDate',
    required: false,
    type: String,
    description: 'Filter to date (ISO string)',
    example: '2023-12-31T23:59:59Z',
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    type: String,
    description: 'Sort by field (default: createdAt)',
    example: 'createdAt',
  })
  @ApiQuery({
    name: 'sortOrder',
    required: false,
    type: String,
    description: 'Sort order (ASC or DESC, default: DESC)',
    example: 'DESC',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search in title and message',
    example: 'transaction',
  })
  @ApiQuery({
    name: 'relatedEntityType',
    required: false,
    type: String,
    description: 'Filter by related entity type',
    example: 'TRANSACTION',
  })
  @ApiResponse({
    status: 200,
    description:
      'All notifications for authenticated user retrieved successfully.',
    type: GetAllNotificationsResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token.',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Invalid query parameters.',
  })
  async getAllNotifications(
    @Request() req: { user: { id: string } },
    @Query() queryDto: GetAllNotificationsQueryDto,
  ): Promise<GetAllNotificationsResponseDto> {
    const userId: string = req.user.id;
    return this.notificationsService.getAllNotificationsForUser(
      userId,
      queryDto,
    );
  }
}
