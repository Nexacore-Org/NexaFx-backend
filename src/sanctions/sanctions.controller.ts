import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { SanctionsService } from './sanctions.service';
import { OverrideScreeningDto } from './dto/override-screening.dto';
import { ScreeningStatus } from './entities/kyc-screening.entity';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/user.entity';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../auth/decorators/current-user.decorator';

@ApiTags('Sanctions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class SanctionsController {
  constructor(private readonly sanctionsService: SanctionsService) {}

  @Get('v2/sanctions/me')
  @ApiOperation({ summary: 'Get your latest screening result' })
  async getMyScreening(@CurrentUser() user: CurrentUserPayload) {
    return this.sanctionsService.getLatestScreening(user.userId);
  }

  @Get('admin/sanctions/screenings')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'List all screenings (Admin)' })
  @ApiQuery({ name: 'status', enum: ScreeningStatus, required: false })
  @ApiQuery({ name: 'page', type: Number, required: false })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  async listScreenings(
    @Query('status') status?: ScreeningStatus,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    return this.sanctionsService.listScreenings(status, page, limit);
  }

  @Patch('admin/sanctions/screenings/:id/override')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Override a WARNING/BLOCKED screening result (Super Admin)' })
  @ApiParam({ name: 'id', type: String })
  async overrideScreening(
    @Param('id') id: string,
    @Body() dto: OverrideScreeningDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.sanctionsService.overrideScreening(id, user.userId, dto.reason);
  }

  @Post('admin/sanctions/screen/:userId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Trigger a manual screening for a user (Admin)' })
  @ApiParam({ name: 'userId', type: String })
  async screenUser(@Param('userId') userId: string) {
    return this.sanctionsService.screenUser(userId);
  }

  @Post('admin/sanctions/sync-ofac')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Trigger a manual OFAC SDN list sync (Super Admin)' })
  async syncOfac() {
    const count = await this.sanctionsService.syncOfacList();
    return { synced: count };
  }
}
