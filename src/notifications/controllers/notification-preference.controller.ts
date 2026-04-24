import {
  Controller,
  Get,
  Put,
  Body,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { NotificationPreferenceService } from '../services/notification-preference.service';
import { UpdateNotificationPreferencesDto } from '../dto/update-notification-preferences.dto';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { NotificationType } from '../enum/notificationType.enum';

@ApiTags('Notification Preferences')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users/me/notification-preferences')
export class NotificationPreferenceController {
  constructor(
    private readonly preferenceService: NotificationPreferenceService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Get notification preferences',
    description: 'Returns preferences grouped by notification type',
  })
  @ApiResponse({
    status: 200,
    description: 'Preferences retrieved successfully',
    schema: {
      example: {
        preferences: [
          {
            type: 'TRANSACTION',
            channels: {
              IN_APP: true,
              EMAIL: true,
              SMS: false,
              PUSH_NOTIFICATION: true,
            },
          },
          {
            type: 'SECURITY',
            channels: {
              IN_APP: true,
              EMAIL: true,
              SMS: true,
              PUSH_NOTIFICATION: true,
            },
            nonDisablable: true,
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getPreferences(
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const preferences = await this.preferenceService.getPreferences(user.userId);

    return {
      preferences: preferences.map((pref) => ({
        type: pref.notificationType,
        channels: pref.channels,
        nonDisablable: pref.notificationType === NotificationType.SECURITY,
      })),
    };
  }

  @Put()
  @ApiOperation({
    summary: 'Update notification preferences',
    description: 'Updates preferences atomically. SECURITY type cannot be disabled.',
  })
  @ApiBody({ type: UpdateNotificationPreferencesDto })
  @ApiResponse({
    status: 200,
    description: 'Preferences updated successfully',
  })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async updatePreferences(
    @CurrentUser() user: CurrentUserPayload,
    @Body() updateDto: UpdateNotificationPreferencesDto,
  ) {
    const results = await this.preferenceService.updatePreferences(
      user.userId,
      updateDto.preferences.map((p) => ({
        type: p.type,
        channels: p.channels,
      })),
    );

    return {
      message: 'Notification preferences updated successfully',
      updated: results.length,
      preferences: results.map((pref) => ({
        type: pref.notificationType,
        channels: pref.channels,
        nonDisablable: pref.notificationType === NotificationType.SECURITY,
      })),
    };
  }
}
