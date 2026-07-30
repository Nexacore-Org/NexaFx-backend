import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RevenueService, Period } from './revenue.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Admin — Revenue')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/revenue')
export class RevenueController {
  constructor(private readonly revenueService: RevenueService) {}

  @Get('dashboard')
  async getDashboard(@Query('period') period: Period = '7d') {
    return this.revenueService.getDashboard(period);
  }

  @Get('snapshots')
  async getSnapshots(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    return this.revenueService.getSnapshots(page, limit);
  }

  @Get('by-stream')
  async getByStream(
    @Query('stream') stream: string,
    @Query('period') period: Period = '30d',
  ) {
    return this.revenueService.getRevenueByStream(
      stream as any,
      period,
    );
  }
}
