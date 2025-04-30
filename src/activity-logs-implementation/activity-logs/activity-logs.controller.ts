import { Controller, Get, Query, UseGuards, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ActivityLogsService } from './activity-logs.service';
import { ActivityLog } from './entities/activity-log.entity';
import { ActivityType } from './constants/activity-types.enum';

@ApiTags('activity-logs')
@Controller('activity-logs')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ActivityLogsController {
  constructor(private readonly activityLogsService: ActivityLogsService) {}

  @Get('user/:userId')
  @ApiOperation({ summary: 'Get activity logs for a specific user' })
  async getLogsByUser(@Param('userId') userId: string): Promise<ActivityLog[]> {
    return this.activityLogsService.findByUser(userId);
  }

  @Get('action/:action')
  @ApiOperation({ summary: 'Get activity logs by action type' })
  async getLogsByAction(
    @Param('action') action: ActivityType,
  ): Promise<ActivityLog[]> {
    return this.activityLogsService.findByAction(action);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search activity logs with filters' })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'action', required: false, enum: ActivityType })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  async searchLogs(
    @Query('userId') userId?: string,
    @Query('action') action?: ActivityType,
    @Query('startDate') startDate?: Date,
    @Query('endDate') endDate?: Date,
  ): Promise<ActivityLog[]> {
    return this.activityLogsService.findWithFilters({
      userId,
      action,
      startDate,
      endDate,
    });
  }
}

