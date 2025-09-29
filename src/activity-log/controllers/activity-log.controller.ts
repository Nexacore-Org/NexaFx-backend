import {
  Controller,
  Get,
  Post,
  Delete,
  Query,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guard/jwt.auth.guard';
import { ActivityLogService } from '../providers/activity-log.service';
import {
  LogoutResponseDto,
  SessionListResponseDto,
} from '../dto/activity-log-response.dto';

@ApiTags('Activity Logs')
@Controller('activity-logs')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ActivityLogController {
  constructor(private readonly activityLogService: ActivityLogService) {}

  @Get('sessions')
  @ApiOperation({ summary: 'Get all active sessions for current user' })
  @ApiResponse({
    status: 200,
    description: 'List of active sessions retrieved successfully',
    type: SessionListResponseDto,
  })
  async getUserSessions(request: Request): Promise<SessionListResponseDto> {
    const userId = request.user?.['id'];
    const currentSessionId = request.user?.['sessionId']; // Assuming session ID is stored in JWT payload

    return this.activityLogService.getUserSessions(userId, currentSessionId);
  }

  @Get('history')
  @ApiOperation({ summary: 'Get activity history for current user' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiResponse({
    status: 200,
    description: 'Activity history retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        activities: {
          type: 'array',
          items: { $ref: '#/components/schemas/ActivityLogResponseDto' },
        },
        total: { type: 'number', example: 50 },
        page: { type: 'number', example: 1 },
        limit: { type: 'number', example: 20 },
      },
    },
  })
  async getUserActivityHistory(
    request: Request,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    const userId = request.user?.['id'];
    return this.activityLogService.getUserActivityHistory(userId, page, limit);
  }

  @Post('logout-other-sessions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout from all other sessions except current' })
  @ApiResponse({
    status: 200,
    description: 'Successfully logged out from other sessions',
    type: LogoutResponseDto,
  })
  async logoutOtherSessions(request: Request): Promise<LogoutResponseDto> {
    const userId = request.user?.['id'];
    const currentSessionId = request.user?.['sessionId'];

    return this.activityLogService.logoutOtherSessions(
      userId,
      currentSessionId,
    );
  }

  @Post('logout-all-sessions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout from all sessions' })
  @ApiResponse({
    status: 200,
    description: 'Successfully logged out from all sessions',
    type: LogoutResponseDto,
  })
  async logoutAllSessions(request: Request): Promise<LogoutResponseDto> {
    const userId = request.user?.['id'];

    return this.activityLogService.logoutAllSessions(userId);
  }

  @Delete('session/:sessionId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Terminate a specific session' })
  @ApiResponse({
    status: 200,
    description: 'Session terminated successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Session terminated successfully' },
      },
    },
  })
  async terminateSession(
    request: Request,
    @Param('sessionId') sessionId: string,
  ) {
    const userId = request.user?.['id'];

    await this.activityLogService.logLogoutActivity(userId, sessionId);

    return {
      message: 'Session terminated successfully',
    };
  }

  @Get('suspicious-check')
  @ApiOperation({ summary: 'Check for suspicious activity for current user' })
  @ApiResponse({
    status: 200,
    description: 'Suspicious activity check completed',
    schema: {
      type: 'object',
      properties: {
        isSuspicious: { type: 'boolean', example: false },
        message: { type: 'string', example: 'No suspicious activity detected' },
      },
    },
  })
  async checkSuspiciousActivity(request: Request) {
    const userId = request.user?.['id'];
    const ipAddress = this.extractIpAddress(request);

    const isSuspicious = await this.activityLogService.checkSuspiciousActivity(
      userId,
      ipAddress,
    );

    return {
      isSuspicious,
      message: isSuspicious
        ? 'Suspicious activity detected. Please verify your account.'
        : 'No suspicious activity detected',
    };
  }

  private extractIpAddress(request: Request): string {
    const forwarded = request.headers['x-forwarded-for'] as string;
    const realIp = request.headers['x-real-ip'] as string;
    const remoteAddress =
      request.connection?.remoteAddress || request.socket?.remoteAddress;

    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    if (realIp) {
      return realIp;
    }
    return remoteAddress || 'Unknown';
  }
}
