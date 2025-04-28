import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { NotificationService } from './notification.service';
import { JwtAuthGuard } from 'src/auth/guard/jwt.auth.guard';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  async getAllNotifications(
    @Request() req: any,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
  ) {
    const userId = req.user.id;
    const [notifications, total] =
      await this.notificationService.getAllNotifications(userId, page, limit);

    return {
      data: notifications,
      meta: {
        total,
        page: +page,
        limit: +limit,
        totalPages: Math.ceil(total / +limit),
      },
    };
  }

  @Get('unread')
  async getUnreadNotifications(@Request() req: any) {
    const userId = req.user.id;
    const notifications =
      await this.notificationService.getUnreadNotifications(userId);

    return {
      data: notifications,
      meta: {
        total: notifications.length,
      },
    };
  }

  @Post(':id/read')
  async markAsRead(@Param('id') id: string, @Request() req: any) {
    const userId = req.user.id;
    const success = await this.notificationService.markAsRead(id, userId);

    return {
      success,
    };
  }

  @Post('read-all')
  async markAllAsRead(@Request() req: any) {
    const userId = req.user.id;
    const success = await this.notificationService.markAllAsRead(userId);

    return {
      success,
    };
  }
}
