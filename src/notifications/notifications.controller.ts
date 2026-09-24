import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('Notifications')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({
    summary: 'Get notifications for authenticated user',
    description: 'Retrieves a paginated list of notifications, newest first, with optional filter by read status',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 10)' })
  @ApiQuery({ name: 'isRead', required: false, type: Boolean, description: 'Filter by read/unread status' })
  @ApiResponse({ status: 200, description: 'Notifications retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getNotifications(
    @Request() req: { user: { userId: string } },
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('isRead') isReadString?: string,
  ) {
    let isRead: boolean | undefined;
    if (isReadString === 'true') {
      isRead = true;
    } else if (isReadString === 'false') {
      isRead = false;
    }

    return this.notificationsService.getNotifications(
      req.user.userId,
      Number(page),
      Number(limit),
      isRead,
    );
  }

  @Patch('read-all')
  @ApiOperation({
    summary: 'Mark all unread notifications as read',
    description: 'Marks all unread notifications for the authenticated user as read',
  })
  @ApiResponse({ status: 200, description: 'All notifications marked as read' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async markAllAsRead(@Request() req: { user: { userId: string } }) {
    return this.notificationsService.markAllAsRead(req.user.userId);
  }

  @Patch(':id/read')
  @ApiOperation({
    summary: 'Mark single notification as read',
    description: 'Marks a specific notification owned by the user as read',
  })
  @ApiResponse({ status: 200, description: 'Notification marked as read' })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async markAsRead(
    @Request() req: { user: { userId: string } },
    @Param('id') id: string,
  ) {
    return this.notificationsService.markAsRead(req.user.userId, id);
  }

  @Get('unread-count')
  @ApiOperation({
    summary: 'Get unread notification count',
    description: 'Returns the count of unread notifications for the authenticated user',
  })
  @ApiResponse({ status: 200, description: 'Unread count retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getUnreadCount(@Request() req: { user: { userId: string } }) {
    return this.notificationsService.getUnreadCount(req.user.userId);
  }
}
