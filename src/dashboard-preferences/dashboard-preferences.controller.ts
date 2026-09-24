import { Body, Controller, Delete, Get, Put } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { DashboardPreferencesService } from './dashboard-preferences.service';
import { SaveDashboardPreferencesDto } from './dto/save-dashboard-preferences.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../auth/decorators/current-user.decorator';

@ApiTags('Dashboard Preferences')
@ApiBearerAuth('access-token')
@Controller('v2/dashboard-preferences')
export class DashboardPreferencesController {
  constructor(private readonly service: DashboardPreferencesService) {}

  @Get()
  @ApiOperation({
    summary:
      'Get the authenticated user\'s dashboard widget layout (defaults for new users)',
  })
  @ApiResponse({ status: 200, description: 'Dashboard layout' })
  get(@CurrentUser() user: CurrentUserPayload) {
    return this.service.getPreferences(user.userId);
  }

  @Put()
  @ApiOperation({
    summary: 'Save (upsert) the authenticated user\'s dashboard widget layout',
  })
  @ApiResponse({ status: 200, description: 'Saved dashboard layout' })
  save(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: SaveDashboardPreferencesDto,
  ) {
    return this.service.savePreferences(user.userId, dto);
  }

  @Delete()
  @ApiOperation({
    summary: 'Reset the authenticated user\'s dashboard to default widgets',
  })
  @ApiResponse({ status: 200, description: 'Default dashboard layout' })
  reset(@CurrentUser() user: CurrentUserPayload) {
    return this.service.resetPreferences(user.userId);
  }
}