import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { HealthReportService } from './health-report.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Admin - Health Report')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/health-report')
export class HealthReportController {
  constructor(private readonly healthReportService: HealthReportService) {}

  @Get('/')
  async getLatestReport() {
    return this.healthReportService.getLatestReport();
  }

  @Get('/history')
  async getReportHistory(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.healthReportService.getReports(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Post('/generate')
  async generateReport() {
    return this.healthReportService.generateReport();
  }
}
