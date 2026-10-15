import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Query,
  Body,
  Param,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { ReportType, ReportFrequency } from './report-schedule.entity';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/user.entity';

// The global RolesGuard returns true when a route carries no roles metadata, so
// without @Roles any authenticated USER could read revenue, cohorts and the
// top-users list, and could queue report jobs.
@ApiTags('Admin Reports')
@ApiBearerAuth('access-token')
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('admin/reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('revenue')
  async getRevenueReport(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('currency') currency: string,
    @Query('format') format?: string,
  ) {
    return this.reportsService.getRevenueReport(from, to, currency, format);
  }

  @Get('users/cohorts')
  async getCohortReport(
    @Query('month') month: string,
    @Query('format') format?: string,
  ) {
    // Previously an absent month reached month.split('-') and returned a 500.
    if (!/^\d{4}-\d{2}$/.test(month ?? '')) {
      throw new BadRequestException('month must be formatted as YYYY-MM');
    }
    return this.reportsService.getCohortReport(month, format);
  }

  @Get('transactions/funnel')
  async getFunnelReport(@Query('format') format?: string) {
    return this.reportsService.getFunnelReport(format);
  }

  @Get('top-users')
  async getTopUsersReport(
    @Query('limit') limit: string = '10',
    @Query('metric') metric: 'volume' | 'count' = 'volume',
    @Query('format') format?: string,
  ) {
    const parsedLimit = Number(limit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      throw new BadRequestException(
        'limit must be an integer between 1 and 100',
      );
    }
    if (metric !== 'volume' && metric !== 'count') {
      throw new BadRequestException('metric must be either volume or count');
    }
    return this.reportsService.getTopUsersReport(
      parsedLimit,
      metric,
      format,
    );
  }

  @Post('schedule')
  async createReportSchedule(
    @Body('reportType') reportType: string,
    @Body('frequency') frequency: string,
    @Body('recipientEmail') recipientEmail: string,
    @Body('parameters') parameters: any,
  ) {
    return this.reportsService.createReportSchedule(
      reportType as ReportType,
      frequency as ReportFrequency,
      recipientEmail,
      parameters,
    );
  }

  @Post()
  async createReportJob(@Body('parameters') parameters: any) {
    return this.reportsService.createReportJob(parameters);
  }

  @Get('jobs/:id')
  async getReportJob(@Param('id') id: string) {
    return this.reportsService.getReportJob(id);
  }
}
