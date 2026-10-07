import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { AssignCategoryDto } from './dto/assign-category.dto';
import {
  SummaryQueryDto,
  TrendsQueryDto,
  BalanceHistoryQueryDto,
  ExportQueryDto,
} from './dto/summary-query.dto';

@ApiTags('Analytics')
@ApiBearerAuth('access-token')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Post('categories')
  @ApiOperation({ summary: 'Create a personal transaction category' })
  async createCategory(@Request() req, @Body() dto: CreateCategoryDto) {
    return this.analyticsService.createCategory(req.user.userId, dto);
  }

  @Get('categories')
  @ApiOperation({ summary: 'List system + personal categories' })
  async getCategories(@Request() req) {
    return this.analyticsService.getCategories(req.user.userId);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Monthly breakdown of transactions' })
  @ApiQuery({ name: 'year', required: false, example: 2026 })
  @ApiQuery({ name: 'month', required: false, example: 6 })
  async getSummary(@Request() req, @Query() query: SummaryQueryDto) {
    const year = query.year || new Date().getFullYear();
    const month = query.month || new Date().getMonth() + 1;
    return this.analyticsService.getMonthlySummary(
      req.user.userId,
      year,
      month,
    );
  }

  @Get('trends')
  @ApiOperation({ summary: 'Month-over-month sent/received/net' })
  @ApiQuery({ name: 'months', required: false, example: 6 })
  async getTrends(@Request() req, @Query() query: TrendsQueryDto) {
    const months = query.months || 6;
    return this.analyticsService.getTrends(req.user.userId, months);
  }

  @Get('balance-history')
  @ApiOperation({ summary: 'Daily wallet balance snapshots' })
  @ApiQuery({ name: 'days', required: false, example: 30 })
  async getBalanceHistory(
    @Request() req,
    @Query() query: BalanceHistoryQueryDto,
  ) {
    const days = query.days || 30;
    return this.analyticsService.getBalanceHistory(req.user.userId, days);
  }

  @Post('export')
  @ApiOperation({ summary: 'Create a report export job (CSV or PDF)' })
  @ApiQuery({ name: 'format', example: 'csv' })
  @ApiQuery({ name: 'from', example: '2026-01-01T00:00:00Z' })
  @ApiQuery({ name: 'to', example: '2026-06-30T23:59:59Z' })
  async createExport(@Request() req, @Query() query: ExportQueryDto) {
    return this.analyticsService.createExportJob(
      req.user.userId,
      query.format,
      query.from,
      query.to,
    );
  }

  @Get('export/:id')
  @ApiOperation({ summary: 'Get export job status' })
  async getExportStatus(@Request() req, @Param('id') id: string) {
    return this.analyticsService.getExportJob(id, req.user.userId);
  }
}

@ApiTags('Transactions')
@ApiBearerAuth('access-token')
@Controller('transactions')
export class TransactionCategoryController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Patch(':id/category')
  @ApiOperation({ summary: 'Manually reassign a transaction category' })
  async assignCategory(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: AssignCategoryDto,
  ) {
    return this.analyticsService.assignCategory(
      id,
      req.user.userId,
      dto.categoryId,
    );
  }
}
