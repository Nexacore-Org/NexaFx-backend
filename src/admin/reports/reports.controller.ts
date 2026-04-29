import { Controller, Get, Post, Query, Body, Param } from '@nestjs/common';
import { ReportsService } from './reports.service';

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
    return this.reportsService.getCohortReport(month, format);
  }

  @Get('transactions/funnel')
  async getFunnelReport(@Query('format') format?: string) {
    return this.reportsService.getFunnelReport(format);
  }

  @Get('top-users')
  async getTopUsersReport(
    @Query('limit') limit: number = 10,
    @Query('metric') metric: 'volume' | 'count' = 'volume',
    @Query('format') format?: string,
  ) {
    return this.reportsService.getTopUsersReport(limit, metric, format);
  }

  @Post('schedule')
  async createReportSchedule(
    @Body('reportType') reportType: string,
    @Body('frequency') frequency: string,
    @Body('recipientEmail') recipientEmail: string,
    @Body('parameters') parameters: any,
  ) {
    return this.reportsService.createReportSchedule(
      reportType,
      frequency,
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
