import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../auth/decorators/current-user.decorator';
import { Public } from '../../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  BulkUpdateNotificationPreferencesDto,
  UnsubscribeTokenQueryDto,
} from '../dto/notification-preference.dto';
import { NotificationPreferenceService } from '../services/notification-preference.service';

@ApiTags('Notification Preferences')
@Controller('notifications')
export class NotificationPreferenceController {
  constructor(
    private readonly preferenceService: NotificationPreferenceService,
  ) {}

  @Get('preferences')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get notification preferences for current user' })
  findAll(@CurrentUser() user: CurrentUserPayload) {
    return this.preferenceService.findAll(user.userId);
  }

  @Patch('preferences')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Bulk update notification preferences' })
  updateMany(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: BulkUpdateNotificationPreferencesDto,
  ) {
    return this.preferenceService.updateMany(user.userId, dto.preferences);
  }

  @Public()
  @Get('unsubscribe')
  @ApiOperation({
    summary: 'Unsubscribe from email notifications by signed token',
  })
  unsubscribeViaLink(@Query() query: UnsubscribeTokenQueryDto) {
    return this.preferenceService.unsubscribe(query.token);
  }

  @Public()
  @Post('unsubscribe')
  @ApiOperation({
    summary: 'One-click unsubscribe from email notifications',
  })
  unsubscribe(@Query() query: UnsubscribeTokenQueryDto) {
    return this.preferenceService.unsubscribe(query.token);
  }
}
