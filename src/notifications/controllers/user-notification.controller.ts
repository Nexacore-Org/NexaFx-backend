import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { NotificationPersistenceService } from '../services/notification-persistence.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../auth/decorators/current-user.decorator';

@ApiTags('User Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users/me/notifications')
export class UserNotificationController {
  constructor(
    private readonly persistenceService: NotificationPersistenceService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Get paginated notifications with unreadCount',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'read', required: false, type: Boolean })
  @ApiQuery({ name: 'archived', required: false, type: Boolean })
  @ApiResponse({
    status: 200,
    description: 'Returns paginated notifications with unreadCount',
  })
  async getNotifications(
    @CurrentUser() user: CurrentUserPayload,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('read') read?: string,
    @Query('archived') archived?: string,
  ) {
    const filter: Record<string, boolean> = {};

    if (read !== undefined) {
      filter.read = read === 'true';
    }

    if (archived !== undefined) {
      filter.archived = archived === 'true';
    }

    return this.persistenceService.getUserNotifications(
      user.userId,
      page || 1,
      limit || 20,
      Object.keys(filter).length > 0 ? filter : undefined,
    );
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread badge count' })
  @ApiResponse({
    status: 200,
    description: 'Returns unread count',
    schema: {
      example: { unreadCount: 5 },
    },
  })
  async getUnreadCount(@CurrentUser() user: CurrentUserPayload) {
    return this.persistenceService.getUnreadCount(user.userId);
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Mark notification as read' })
  @ApiParam({ name: 'id', type: String, description: 'Notification UUID' })
  @ApiResponse({
    status: 200,
    description: 'Notification marked as read',
  })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  async markAsRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.persistenceService.markAsRead(id, user.userId);
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  @ApiResponse({
    status: 200,
    description: 'All notifications marked as read',
    schema: {
      example: { updated: 15 },
    },
  })
  async markAllAsRead(@CurrentUser() user: CurrentUserPayload) {
    return this.persistenceService.markAllAsRead(user.userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete a notification' })
  @ApiParam({ name: 'id', type: String, description: 'Notification UUID' })
  @ApiResponse({
    status: 200,
    description: 'Notification deleted successfully',
  })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  async deleteNotification(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.persistenceService.softDelete(id, user.userId);
  }
}
