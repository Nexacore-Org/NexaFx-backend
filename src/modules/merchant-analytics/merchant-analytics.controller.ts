import { Controller, Get, Query, Res, Post, Body } from '@nestjs/common';
import { MerchantAnalyticsService } from './merchant-analytics.service';
import { AnalyticsQueryDto, ExportAnalyticsDto } from './dto/merchant-analytics.dto';
import { Response } from 'express';

@Controller('analytics')
export class MerchantAnalyticsController {
  constructor(private readonly analyticsService: MerchantAnalyticsService) {}

  @Get('dashboard')
  getDashboard(@Query() query: AnalyticsQueryDto) {
    return this.analyticsService.getDashboardMetrics(query);
  }

  @Post('export')
  exportData(@Body() dto: ExportAnalyticsDto, @Res() res: Response) {
    const data = this.analyticsService.generateExport(dto);
    
    if (dto.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="analytics.csv"');
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="analytics.json"');
    }
    
    return res.send(data);
  }
}
