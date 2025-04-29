

import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guard/jwt.auth.guard';
import { Roles } from 'src/common/decorators/roles.decorators';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { AdminStatsService } from '../services/admin.stats.service';
import { OverviewStatsDto } from '../dto/overview-stats.dto';
import { TopCurrencyDto } from '../dto/top-currency.dto';
import { UserStatsDto } from '../dto/user-stats.dto';

@ApiTags('Admin Stats')
@ApiBearerAuth()
@Controller('admin/stats')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminStatsController {
  constructor(private readonly adminStatsService: AdminStatsService) {}

  @Get('overview')
  @Roles('admin')
  @ApiOperation({ summary: 'Get overview statistics for admin dashboard' })
  @ApiResponse({ status: 200, description: 'Returns overview statistics', type: OverviewStatsDto })
  async getOverviewStats(): Promise<OverviewStatsDto> {
    return this.adminStatsService.getOverviewStats();
  }

  @Get('top-currencies')
  @Roles('admin')
  @ApiOperation({ summary: 'Get top currencies statistics' })
  @ApiResponse({ status: 200, description: 'Returns top currencies statistics', type: [TopCurrencyDto] })
  async getTopCurrencies(): Promise<TopCurrencyDto[]> {
    return this.adminStatsService.getTopCurrencies();
  }

  @Get('users')
  @Roles('admin')
  @ApiOperation({ summary: 'Get user growth statistics' })
  @ApiResponse({ status: 200, description: 'Returns user statistics', type: UserStatsDto })
  async getUserStats(): Promise<UserStatsDto> {
    return this.adminStatsService.getUserStats();
  }
}