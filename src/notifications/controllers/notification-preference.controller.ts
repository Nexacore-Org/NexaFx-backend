import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
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
  @Throttle({
    default: {
      ttl: 60 * 1000,
      limit: Number(process.env.THROTTLE_UNSUBSCRIBE_LIMIT ?? 10),
    },
  })
  @Get('unsubscribe')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Unsubscribe from email notifications via signed token link click',
  })
  unsubscribeViaLink(@Query() query: UnsubscribeTokenQueryDto) {
    return this.preferenceService.unsubscribe(query.token);
  }

  @Public()
  @Throttle({
    default: {
      ttl: 60 * 1000,
      limit: Number(process.env.THROTTLE_UNSUBSCRIBE_LIMIT ?? 10),
    },
  })
  @Post('unsubscribe')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Unsubscribe from email notifications by signed token (RFC 8058 one-click)',
  })
  unsubscribe(@Query() query: UnsubscribeTokenQueryDto) {
    return this.preferenceService.unsubscribe(query.token);
  }
}
